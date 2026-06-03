import os
import json
import re
import aiohttp
from typing import List, Dict, Optional, Tuple
from difflib import SequenceMatcher
from .. import database
from ..logger import get_logger

logger = get_logger("basketmate")

# 环境变量配置
BAIDU_OCR_API_KEY = os.environ.get("BAIDU_OCR_API_KEY", "")
BAIDU_OCR_SECRET_KEY = os.environ.get("BAIDU_OCR_SECRET_KEY", "")
LLM_API_URL = os.environ.get("LLM_API_URL", "http://localhost:8080/v1/chat/completions")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
USE_REAL_OCR = os.environ.get("USE_REAL_OCR", "false").lower() == "true"
USE_LLM_CORRECTION = os.environ.get("USE_LLM_CORRECTION", "false").lower() == "true"
USE_FUZZY_MATCH = os.environ.get("USE_FUZZY_MATCH", "true").lower() == "true"

# 全局食材映射（程序启动时加载一次）
ALIAS_MAP: Dict[str, str] = {}  # {别名: 标准名称}
NAME_TO_ID: Dict[str, str] = {}  # {标准名称: id}
BLACKLIST_PATTERNS: List[str] = []  # 黑名单模式列表


def load_ingredient_maps() -> None:
    """
    从数据库加载食材映射，初始化全局变量
    - ALIAS_MAP: {别名: 标准名称}
    - NAME_TO_ID: {标准名称: id}
    """
    global ALIAS_MAP, NAME_TO_ID
    
    try:
        response = database.supabase.table("ingredients").select("id, name, alias").execute()
        ingredients = response.data or []
        
        alias_map: Dict[str, str] = {}
        name_to_id: Dict[str, str] = {}
        
        for ing in ingredients:
            name = (ing.get("name") or "").strip()
            ing_id = ing.get("id")
            alias_str = ing.get("alias") or ""
            
            if name and ing_id:
                name_to_id[name] = ing_id
                alias_map[name] = name  # 标准名也映射到自身
            
            if alias_str:
                # 按顿号、逗号、换行拆分别名
                aliases = re.split(r"[、,，\n]+", alias_str)
                for alias in aliases:
                    alias = alias.strip()
                    if alias:
                        alias_map[alias] = name
        
        ALIAS_MAP = alias_map
        NAME_TO_ID = name_to_id
        logger.info(f"[OCR Service] 加载了 {len(name_to_id)} 个食材，构建了 {len(alias_map)} 个别名映射")
    except Exception as e:
        logger.error(f"[OCR Service] 加载食材映射失败: {e}")


def load_blacklist() -> None:
    """
    从数据库加载黑名单模式
    """
    global BLACKLIST_PATTERNS
    
    try:
        response = database.supabase.table("blacklist").select("pattern").execute()
        patterns = [item.get("pattern", "") for item in response.data or [] if item.get("pattern")]
        BLACKLIST_PATTERNS = patterns
        logger.info(f"[OCR Service] 加载了 {len(patterns)} 个黑名单模式")
    except Exception as e:
        logger.error(f"[OCR Service] 加载黑名单失败: {e}")


def add_to_blacklist(pattern: str) -> None:
    """
    实时添加黑名单模式（内存中）
    """
    if pattern and pattern not in BLACKLIST_PATTERNS:
        BLACKLIST_PATTERNS.append(pattern)
        logger.info(f"[OCR Service] 添加黑名单模式: {pattern}")


def clean_name(name: str) -> str:
    """
    清洗食材名称：
    1. 去掉末尾的数字+单位（如 250g、35g、20枚、3包）
    2. 去掉开头连续英文字母/数字（品牌前缀）
    3. 去掉括号及内容
    """
    if not name:
        return ""
    
    cleaned = name.strip()
    
    # 去掉括号及内容
    cleaned = re.sub(r'（[^）]*）', '', cleaned)  # 中文括号
    cleaned = re.sub(r'\([^)]*\)', '', cleaned)   # 英文括号
    
    # 去掉末尾的数字+单位
    cleaned = re.sub(r'\d+\s*(g|kg|ml|l|枚|个|包|袋|瓶|罐)\b', '', cleaned, flags=re.IGNORECASE)
    
    # 去掉开头连续英文字母/数字（品牌前缀）
    cleaned = re.sub(r'^[a-zA-Z0-9]+', '', cleaned)
    
    return cleaned.strip()


def build_item_type1(raw_name: str, nums: List[float]) -> Optional[Dict]:
    """
    文本1规则（有"品名/货号"表头）：
    - 所有商品 price=0，quantity=1
    """
    # 清洗名称
    if '/' in raw_name:
        name = raw_name.rsplit('/', 1)[0].strip()
    else:
        name = raw_name.strip()
    name = re.sub(r'^\d+\s*', '', name)
    if not name:
        return None
    
    price = 0.0
    quantity = 1
    
    return {"name": name, "price": price, "quantity": quantity}


def build_item_type2(raw_name: str, nums: List[float]) -> Optional[Dict]:
    """
    文本2规则（只有"品名"表头）：
    - 五列：商品名、编号、单价、数量、小计（数字4个）
    - 注意：quantity 统一设为 1，数量叠加在合并阶段进行
    """
    name = re.sub(r'^\d+\s*', '', raw_name)
    if '/' in name:
        name = name.rsplit('/', 1)[0].strip()
    name = name.strip()
    if not name:
        return None
    
    price = 0.0
    
    # 保留单价（如果有数字）
    if len(nums) >= 2:
        price = round(nums[1], 2)
    
    # 数量统一设为 1，数量叠加在合并阶段进行
    return {"name": name, "price": price, "quantity": 1}


def parse_receipt(raw_text: str) -> List[Dict]:
    """
    标准小票解析器：
    1. 识别格式（文本1特征为"品名/货号"，文本2特征为单独"品名"）
    2. 过滤无用行（原价行、表头行、停止关键词行）
    3. 提取商品名和数字
    4. 根据格式类型构建商品项
    """
    lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
    
    if not lines:
        return []
    
    # 识别格式
    is_type1 = any('品名/货号' in l for l in lines)
    
    # 阶段1：过滤无用行
    clean_lines = []
    stop_keywords = ['件数'] if is_type1 else []
    skip_keywords = ['原价']
    
    # 找到表头结束位置
    header_end = 0
    for i, l in enumerate(lines):
        if re.search(r'品名', l):
            header_end = i
            while header_end + 1 < len(lines) and any(kw in lines[header_end + 1] for kw in ['单价', '数量', '小计', '金额']):
                header_end += 1
            break
    start_idx = header_end + 1
    
    for i in range(start_idx, len(lines)):
        line = lines[i]
        if any(kw in line for kw in stop_keywords):
            break
        if any(kw in line for kw in skip_keywords):
            continue
        if any(kw in line for kw in ['品名', '单价', '数量', '小计', '金额', '货号']):
            continue
        if not re.search(r'[\u4e00-\u9fff]', line) and not re.match(r'^\d+(\.\d+)?$', line):
            continue
        clean_lines.append(line)
    
    # 阶段2：提取商品
    items = []
    i = 0
    while i < len(clean_lines):
        line = clean_lines[i]
        if re.search(r'[\u4e00-\u9fff]', line) or ('/' in line and re.search(r'\d', line)):
            name = line
            i += 1
            
            # 检查商品名行是否包含行内空格分隔的数字（如 "商品名 2 16.85"）
            inline_nums: List[float] = []
            name_parts = name.split()
            if len(name_parts) > 1:
                # 行末部分是数字
                for part in name_parts[1:]:
                    if re.match(r'^\d+(\.\d+)?$', part):
                        inline_nums.append(float(part))
                    else:
                        break
                # 保留商品名部分
                name = ' '.join(name_parts[:len(name_parts) - len(inline_nums)]) if inline_nums else name
            
            # 继续收集后续的数字行
            while i < len(clean_lines) and re.match(r'^\d+(\.\d+)?$', clean_lines[i]):
                inline_nums.append(float(clean_lines[i]))
                i += 1
            
            nums = inline_nums
            
            if is_type1:
                item = build_item_type1(name, nums)
            else:
                item = build_item_type2(name, nums)
            if item:
                items.append(item)
        else:
            i += 1
    
    logger.info(f"[OCR Service] 标准解析：提取了 {len(items)} 个商品，格式类型={1 if is_type1 else 2}")
    return items


def parse_receipt_smart(raw_text: str) -> List[Dict]:
    """
    智能列解析器：
    1. 预处理文本（去除纯符号行、去除"原价：xxx"行）
    2. 识别表头（支持横排和竖排）
    3. 遍历商品行，收集数字并分配字段
    4. 返回商品列表
    """
    if not raw_text or not raw_text.strip():
        return []
    
    # 1. 预处理文本
    lines = []
    for line in raw_text.split('\n'):
        line = line.strip()
        if not line:
            continue
        
        # 过滤纯符号分隔线（如 =======）
        if re.match(r'^[=\-—~*#]+$', line):
            continue
        
        # 过滤"原价：xxx"行
        if re.match(r'^\s*原价\s*[:：]\s*[\d.]+', line):
            continue
        
        lines.append(line)
    
    if len(lines) < 3:
        return []
    
    # 2. 识别表头
    header_keywords = {
        'name': ['品名', '商品', '货号', '名称'],
        'price': ['单价', '价格', '零售价', '售价'],
        'qty': ['数量', '件数', '份数'],
        'subtotal': ['小计', '金额', '合计'],
    }
    
    header_order: List[str] = []  # 记录列顺序，如 ['price', 'qty', 'subtotal']
    header_end_idx = -1
    found_header = False
    
    # 扫描前部行（最多扫描前15行）
    scan_lines = lines[:min(15, len(lines))]
    
    for i, line in enumerate(scan_lines):
        line_lower = line.lower()
        
        # 检查是否包含表头关键词
        found_in_this_line = []
        
        # 横排表头：一行包含多个关键词
        if any(kw in line_lower for kw in header_keywords['price']):
            found_in_this_line.append('price')
        if any(kw in line_lower for kw in header_keywords['qty']):
            found_in_this_line.append('qty')
        if any(kw in line_lower for kw in header_keywords['subtotal']):
            found_in_this_line.append('subtotal')
        
        if found_in_this_line:
            header_order.extend(found_in_this_line)
            found_header = True
            header_end_idx = i
            # 继续检查后续行，看是否有竖排的其他字段
            j = i + 1
            while j < len(scan_lines):
                next_line = scan_lines[j].lower()
                added = False
                
                if 'price' not in header_order and any(kw in next_line for kw in header_keywords['price']):
                    header_order.append('price')
                    added = True
                elif 'qty' not in header_order and any(kw in next_line for kw in header_keywords['qty']):
                    header_order.append('qty')
                    added = True
                elif 'subtotal' not in header_order and any(kw in next_line for kw in header_keywords['subtotal']):
                    header_order.append('subtotal')
                    added = True
                
                if added:
                    header_end_idx = j
                    j += 1
                else:
                    break
            break
    
    # 如果没有找到横排表头，检查是否有竖排表头
    if not found_header:
        for i, line in enumerate(scan_lines):
            line_lower = line.lower()
            
            if any(kw in line_lower for kw in header_keywords['price']):
                if 'price' not in header_order:
                    header_order.append('price')
                    header_end_idx = i
            elif any(kw in line_lower for kw in header_keywords['qty']):
                if 'qty' not in header_order:
                    header_order.append('qty')
                    header_end_idx = i
            elif any(kw in line_lower for kw in header_keywords['subtotal']):
                if 'subtotal' not in header_order:
                    header_order.append('subtotal')
                    header_end_idx = i
        
        # 只有找到至少两个字段才认为是有效表头
        if len(header_order) >= 2:
            found_header = True
    
    if not found_header or header_end_idx < 0:
        logger.info(f"[OCR Service] 智能解析：未找到有效表头")
        return []
    
    logger.info(f"[OCR Service] 智能解析：表头顺序={header_order}, 表头结束行={header_end_idx}")
    
    # 3. 遍历商品
    items = []
    summary_keywords = ['应付', '合计', '总金额', '总计', '实收', '找零', '件数：', '数量：']
    i = header_end_idx + 1
    
    while i < len(lines):
        line = lines[i]
        line_lower = line.lower()
        
        # 检查是否是汇总行
        if any(kw in line_lower for kw in summary_keywords):
            logger.info(f"[OCR Service] 智能解析：遇到汇总行 '{line}'，停止解析")
            break
        
        # 识别商品名行：包含中文，通常带有货号斜杠，或者不是纯数字
        if re.search(r'[\u4e00-\u9fa5]', line) and not re.match(r'^[\d.\s]+$', line):
            # 提取商品名：取最后一个斜杠之前的部分（去除货号）
            if '/' in line:
                parts = line.split('/')
                # 取最后一个斜杠之前的所有内容拼接
                name_part = '/'.join(parts[:-1]).strip() if len(parts) > 1 else line.strip()
            else:
                name_part = line.strip()
            
            # 收集后续数字行
            nums: List[float] = []
            j = i + 1
            
            while j < len(lines):
                num_line = lines[j]
                
                # 检查是否是汇总行
                if any(kw in num_line.lower() for kw in summary_keywords):
                    break
                
                # 检查是否是空行或纯符号
                if not num_line.strip() or re.match(r'^[\-–—/\\.|·]+$', num_line):
                    j += 1
                    continue
                
                # 尝试提取数字（纯数字行）
                num_match = re.match(r'^\s*(\d+\.?\d*)\s*$', num_line)
                if num_match:
                    nums.append(float(num_match.group(1)))
                    j += 1
                else:
                    # 非数字行，跳过但继续收集
                    j += 1
                    continue
            
            # 根据收集到的数字列表和表头顺序分配字段
            # 注意：quantity 统一设为 1，数量叠加在合并阶段进行
            price = 0.0
            
            if len(nums) >= 1:
                # 保留第一个数字作为单价（通常是价格）
                price = round(nums[0], 2)
            
            items.append({
                "name": name_part,
                "price": price,
                "quantity": 1,  # 数量统一设为 1，数量叠加在合并阶段进行
                "image_index": 0,
            })
            logger.info(f"[OCR Service] 智能解析：提取商品 '{name_part}', price={price}, quantity=1")
            
            i = j
        else:
            i += 1
    
    logger.info(f"[OCR Service] 智能解析成功：提取了 {len(items)} 个商品")
    return items


def merge_items(items: List[Dict]) -> List[Dict]:
    """
    合并规则：
    - 有 ingredient_id 的项：按 ingredient_id 分组合并，quantity累加，price加权平均
    - 无 ingredient_id 的项：保持独立，不合并
    - name 保持为原始商品名称，ingredient_name 记录匹配的食材名
    """
    merged: Dict[str, Dict] = {}
    unmerged: List[Dict] = []  # 存储无 ingredient_id 的项
    
    for item in items:
        name = item.get("name", "").strip()
        if not name:
            continue
        
        ingredient_id = item.get("ingredient_id")
        price = float(item.get("price") or 0)
        quantity = float(item.get("quantity") or 1)  # 保持为 float，不强制转换为 int
        
        if ingredient_id:
            # 有 ingredient_id，按 ingredient_id 合并
            key = str(ingredient_id)
            
            if key not in merged:
                merged[key] = {
                    "name": name,  # 保持原始商品名称
                    "price": price,
                    "quantity": quantity,
                    "ingredient_id": ingredient_id,
                    "ingredient_name": item.get("ingredient_name"),
                    "price_total": price * quantity,
                    "quantity_total": quantity,
                    "original_names": [name],
                }
            else:
                merged[key]["quantity_total"] += quantity
                merged[key]["price_total"] += price * quantity
                original_names = merged[key]["original_names"]
                if name not in original_names:
                    original_names.append(name)
        else:
            # 无 ingredient_id，保持独立
            unmerged.append({
                "name": name,
                "price": price,
                "quantity": quantity,
                "original_names": [name],
            })
    
    # 计算合并项的加权平均价格
    result = []
    for key, data in merged.items():
        total_qty = data["quantity_total"]
        total_price = data["price_total"]
        avg_price = round(total_price / total_qty, 2) if total_qty > 0 else 0
        
        result.append({
            "name": data["name"],  # 保持原始商品名称
            "price": avg_price,
            "quantity": round(total_qty, 3),  # 保留3位小数
            "ingredient_id": data["ingredient_id"],
            "ingredient_name": data["ingredient_name"],
            "original_names": data["original_names"],
        })
    
    # 添加未合并的项
    result.extend(unmerged)
    
    return result


def match_ingredients(items: List[Dict]) -> List[Dict]:
    """
    食材表匹配：如果 name 完全等于食材名或食材别名，则匹配成功
    - 返回字段：name（商品名）、price（单价）、quantity（数量）、ingredient_id、ingredient_name
    - 不修改 name、price、quantity
    - 匹配规则：USE_FUZZY_MATCH=true时使用模糊匹配，否则精确匹配
    """
    ensure_initialized()  # 确保映射已加载
    
    result = []
    
    for item in items:
        name = item.get("name", "").strip()
        
        # 查找是否在别名表中（精确匹配 name）
        standard_name = ALIAS_MAP.get(name, None)
        mapped = standard_name is not None
        
        # 如果精确匹配失败，且启用模糊匹配，则尝试模糊匹配
        if not mapped and USE_FUZZY_MATCH:
            best_match = None
            best_ratio = 0
            threshold = 0.8  # 相似度阈值
            
            for alias, std_name in ALIAS_MAP.items():
                ratio = SequenceMatcher(None, name, alias).ratio()
                if ratio > best_ratio and ratio >= threshold:
                    best_ratio = ratio
                    best_match = std_name
            
            if best_match:
                mapped = True
                standard_name = best_match
                logger.debug(f"[食材匹配] 模糊匹配: '{name}' -> '{best_match}' (相似度: {best_ratio:.2f})")
        
        result.append({
            "original_name": name,
            "cleaned_name": name,
            "name": name,  # 保持原名不变
            "price": item.get("price", 0),
            "quantity": item.get("quantity", 1),
            "mapped": mapped,
            "ingredient_id": NAME_TO_ID.get(standard_name) if mapped else None,
            "ingredient_name": standard_name if mapped else None,
        })
    
    return result


async def llm_correct(items: List[Dict]) -> List[Dict]:
    """
    LLM纠错：仅纠正商品名中的OCR错字，不改变商品含义
    """
    if not items:
        return items
    
    # 常见OCR错字映射
    common_ocr_errors = {
        "西红布": "西红柿",
        "西红市": "西红柿",
        "西虹柿": "西红柿",
        "土旦": "土豆",
        "土立": "土豆",
        "青瓜": "黄瓜",
        "黄爪": "黄瓜",
        "黄爪": "黄瓜",
        "白菜": "白菜",
        "白采": "白菜",
        "萝葡": "萝卜",
        "罗卜": "萝卜",
        "菠罗": "菠萝",
        "波萝": "菠萝",
        "苹菓": "苹果",
        "平果": "苹果",
        "香焦": "香蕉",
        "香交": "香蕉",
        "橙孑": "橙子",
        "橙了": "橙子",
        "葡淘": "葡萄",
        "葡桃": "葡萄",
        "蜜挑": "蜜桃",
        "密桃": "蜜桃",
        "西瓜子": "西瓜",
        "西爪": "西瓜",
        "南瓜子": "南瓜",
        "冬瓜子": "冬瓜",
        "茄子": "茄子",
        "茄孑": "茄子",
        "豆腐": "豆腐",
        "豆付": "豆腐",
        "豆府": "豆腐",
        "鸡蛋": "鸡蛋",
        "鸡旦": "鸡蛋",
        "鸭旦": "鸭蛋",
        "鱼旦": "鱼蛋",
        "牛乃": "牛奶",
        "牛内": "牛肉",
        "羊内": "羊肉",
        "猪内": "猪肉",
        "鸡内": "鸡肉",
        "鸭内": "鸭肉",
        "鱼内": "鱼肉",
        "青菜": "青菜",
        "青采": "青菜",
        "生菜": "生菜",
        "生采": "生菜",
        "芹菜": "芹菜",
        "芹采": "芹菜",
        "韭菜": "韭菜",
        "韭采": "韭菜",
        "香菜": "香菜",
        "香采": "香菜",
        "葱": "葱",
        "匆": "葱",
        "蒜": "蒜",
        "祘": "蒜",
        "姜": "姜",
        "江": "姜",
        "辣椒": "辣椒",
        "辣交": "辣椒",
        "花椒": "花椒",
        "花交": "花椒",
        "八角": "八角",
        "八交": "八角",
        "桂皮": "桂皮",
        "桂支": "桂皮",
        "香叶": "香叶",
        "香页": "香叶",
        "料酒": "料酒",
        "料九": "料酒",
        "酱油": "酱油",
        "酱由": "酱油",
        "醋": "醋",
        "错": "醋",
        "盐": "盐",
        "言": "盐",
        "糖": "糖",
        "塘": "糖",
        "油": "油",
        "由": "油",
        "米": "米",
        "来": "米",
        "面": "面",
        "面": "面",
        "粉": "粉",
        "份": "粉",
        "水": "水",
        "永": "水",
        "茶": "茶",
        "查": "茶",
        "咖啡": "咖啡",
        "咖非": "咖啡",
        "可乐": "可乐",
        "可了": "可乐",
        "雪碧": "雪碧",
        "雪碧": "雪碧",
        "芬达": "芬达",
        "分达": "芬达",
        "脉动": "脉动",
        "脉冻": "脉动",
        "红牛": "红牛",
        "红午": "红牛",
        "面包": "面包",
        "面饱": "面包",
        "蛋糕": "蛋糕",
        "蛋羔": "蛋糕",
        "饼干": "饼干",
        "饼干预": "饼干",
        "巧克力": "巧克力",
        "巧克立": "巧克力",
        "薯片": "薯片",
        "署片": "薯片",
        "瓜子": "瓜子",
        "瓜籽": "瓜子",
        "花生": "花生",
        "化生": "花生",
        "核桃": "核桃",
        "合桃": "核桃",
        "杏仁": "杏仁",
        "杏人": "杏仁",
        "腰果": "腰果",
        "腰杲": "腰果",
        "开心果": "开心果",
        "开开心果": "开心果",
        "牛奶": "牛奶",
        "牛乃": "牛奶",
        "酸奶": "酸奶",
        "酸乃": "酸奶",
        "奶酪": "奶酪",
        "奶烙": "奶酪",
        "黄油": "黄油",
        "黄由": "黄油",
        "芝士": "芝士",
        "知士": "芝士",
        "火腿肠": "火腿肠",
        "火腿长": "火腿肠",
        "方便面": "方便面",
        "方便便面": "方便面",
        "米饭": "米饭",
        "米反": "米饭",
        "馒头": "馒头",
        "慢头": "馒头",
        "包子": "包子",
        "包孑": "包子",
        "饺子": "饺子",
        "饺孑": "饺子",
        "馄饨": "馄饨",
        "馄炖": "馄饨",
        "面条": "面条",
        "面条约": "面条",
        "米粉": "米粉",
        "米份": "米粉",
        "米线": "米线",
        "米现": "米线",
        "粉丝": "粉丝",
        "粉丝": "粉丝",
        "粉条": "粉条",
        "粉条约": "粉条",
        "腐竹": "腐竹",
        "付竹": "腐竹",
        "木耳": "木耳",
        "木尔": "木耳",
        "香菇": "香菇",
        "香姑": "香菇",
        "金针菇": "金针菇",
        "金针姑": "金针菇",
        "杏鲍菇": "杏鲍菇",
        "杏包菇": "杏鲍菇",
        "蟹味菇": "蟹味菇",
        "蟹喂菇": "蟹味菇",
        "虾仁": "虾仁",
        "虾人": "虾仁",
        "虾皮": "虾皮",
        "虾匹": "虾皮",
        "海带": "海带",
        "海代": "海带",
        "紫菜": "紫菜",
        "紫采": "紫菜",
        "蛤蜊": "蛤蜊",
        "蛤利": "蛤蜊",
        "扇贝": "扇贝",
        "扇背": "扇贝",
        "生蚝": "生蚝",
        "生耗": "生蚝",
        "鱿鱼": "鱿鱼",
        "尤鱼": "鱿鱼",
        "墨鱼": "墨鱼",
        "默鱼": "墨鱼",
        "带鱼": "带鱼",
        "代鱼": "带鱼",
        "鲤鱼": "鲤鱼",
        "里鱼": "鲤鱼",
        "鲫鱼": "鲫鱼",
        "即鱼": "鲫鱼",
        "草鱼": "草鱼",
        "草鱼": "草鱼",
        "鲈鱼": "鲈鱼",
        "卢鱼": "鲈鱼",
        "三文鱼": "三文鱼",
        "三纹鱼": "三文鱼",
        "金枪鱼": "金枪鱼",
        "吞拿鱼": "金枪鱼",
        "鳕鱼": "鳕鱼",
        "雪鱼": "鳕鱼",
        "龙利鱼": "龙利鱼",
        "龙俐鱼": "龙利鱼",
        "虾仁": "虾仁",
        "虾仁": "虾仁",
        "蟹肉": "蟹肉",
        "蟹内": "蟹肉",
        "蟹黄": "蟹黄",
        "蟹皇": "蟹黄",
        "海参": "海参",
        "海渗": "海参",
        "鲍鱼": "鲍鱼",
        "鲍雨": "鲍鱼",
        "鱼翅": "鱼翅",
        "鱼翅": "鱼翅",
        "燕窝": "燕窝",
        "燕莴": "燕窝",
        "鲍鱼": "鲍鱼",
        "鲍雨": "鲍鱼",
        "鱼翅": "鱼翅",
        "鱼翅": "鱼翅",
        "燕窝": "燕窝",
        "燕莴": "燕窝",
    }
    
    def is_safe_correction(original: str, corrected: str) -> bool:
        """
        判断纠正是安全的：编辑距离不超过2，或者是常见错字映射
        """
        # 如果是常见错字映射，直接通过
        if common_ocr_errors.get(original) == corrected:
            return True
        
        # 计算编辑距离
        distance = SequenceMatcher(None, original, corrected).distance()
        
        # 编辑距离 <= 2 认为是安全的
        if distance <= 2:
            return True
        
        return False
    
    try:
        # 准备输入
        items_json = json.dumps(items, ensure_ascii=False)
        
        # 极简版本的 prompt，只纠正 OCR 形近错字
        prompt = f"""你是 OCR 纠错器。将以下 JSON 数组中的 name 字段纠正为正确的汉字（仅修正明显的 OCR 识别错误，如字形相似导致的错字），禁止改动 price 和 quantity，禁止替换成不同的商品。直接输出修正后的 JSON 数组。
{items_json}"""
        
        headers = {
            "Content-Type": "application/json",
        }
        if LLM_API_KEY:
            headers["Authorization"] = f"Bearer {LLM_API_KEY}"
        
        payload = {
            "model": "deepseek-v4-flash",
            "messages": [
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(LLM_API_URL, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as response:
                if response.status == 200:
                    result = await response.json()
                    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                    
                    if not content.strip():
                        logger.info("[OCR Service] LLM纠错返回为空，保留原数据")
                        return items
                    
                    # 清理内容
                    cleaned_content = content.strip()
                    if cleaned_content.startswith("```json"):
                        cleaned_content = cleaned_content[7:]
                    if cleaned_content.startswith("```"):
                        cleaned_content = cleaned_content[3:]
                    if cleaned_content.endswith("```"):
                        cleaned_content = cleaned_content[:-3]
                    cleaned_content = cleaned_content.strip()
                    
                    try:
                        parsed = json.loads(cleaned_content)
                        if isinstance(parsed, list):
                            # 校验每个商品的修改是否安全
                            safe_result = []
                            for i, item in enumerate(parsed):
                                if i < len(items):
                                    original_name = items[i].get("name", "")
                                    corrected_name = item.get("name", "")
                                    
                                    if is_safe_correction(original_name, corrected_name):
                                        safe_result.append(item)
                                    else:
                                        # 修改过大，回退到原名称
                                        logger.warning(f"[OCR Service] 修正不安全，回退原名称: '{original_name}' -> '{corrected_name}'")
                                        safe_result.append(items[i])
                                else:
                                    safe_result.append(item)
                            
                            logger.info(f"[OCR Service] LLM纠错成功，处理了 {len(safe_result)} 个商品")
                            return safe_result
                    except json.JSONDecodeError:
                        logger.info("[OCR Service] LLM纠错返回格式错误，保留原数据")
        
        logger.warning("[OCR Service] LLM纠错失败，保留原数据")
    except Exception as e:
        logger.error(f"[OCR Service] LLM纠错异常: {e}，保留原数据")
    
    return items


def filter_blacklist(items: List[Dict]) -> List[Dict]:
    """
    黑名单过滤：过滤掉名称匹配黑名单模式的项
    """
    ensure_initialized()  # 确保黑名单已加载
    
    if not BLACKLIST_PATTERNS:
        return items
    
    filtered = []
    for item in items:
        name = item.get("name", "").strip()
        matched = False
        
        for pattern in BLACKLIST_PATTERNS:
            if pattern in name:
                matched = True
                break
        
        if not matched:
            filtered.append(item)
        else:
            logger.info(f"[OCR Service] 黑名单过滤：移除 '{name}'")
    
    return filtered


async def get_baidu_access_token() -> Optional[str]:
    """获取百度 OCR Access Token"""
    if not BAIDU_OCR_API_KEY or not BAIDU_OCR_SECRET_KEY:
        return None
    
    url = "https://aip.baidubce.com/oauth/2.0/token"
    params = {
        "grant_type": "client_credentials",
        "client_id": BAIDU_OCR_API_KEY,
        "client_secret": BAIDU_OCR_SECRET_KEY,
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=params) as response:
                if response.status == 200:
                    result = await response.json()
                    return result.get("access_token")
                return None
    except Exception as e:
        logger.error(f"[OCR Service] 获取 Access Token 异常: {e}")
        return None


async def call_baidu_ocr(image_base64: str, access_token: str) -> Optional[str]:
    """调用百度 OCR API"""
    url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={access_token}"
    
    if image_base64.startswith("data:image/"):
        image_base64 = image_base64.split(",")[1]
    
    data = {
        "image": image_base64,
        "language_type": "CHN_ENG",
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=data) as response:
                if response.status == 200:
                    result = await response.json()
                    words_result = result.get("words_result", [])
                    raw_text = "\n".join(item.get("words", "") for item in words_result)
                    logger.info(f"[OCR Service] OCR 原始文本:\n{raw_text}\n{'='*60}")
                    return raw_text
                logger.warning(f"[OCR Service] OCR API 返回状态码: {response.status}")
                return None
    except Exception as e:
        logger.error(f"[OCR Service] 调用 OCR API 异常: {e}")
        return None


async def recognize_receipt(image_base64: str, image_index: int = 0) -> List[Dict]:
    """
    识别小票图片，返回食材列表（完整流程）
    
    流程：OCR → 标准解析 → 智能列解析 → LLM纠错 → 名称清洗 → 食材匹配 → 同名合并 → 黑名单过滤
    """
    import json
    
    logger.info(f"\n{'='*80}")
    logger.info(f"[OCR Service] 开始处理图片 #{image_index}")
    logger.info(f"{'='*80}")
    
    # 检查 API Key 是否配置
    if not BAIDU_OCR_API_KEY or not BAIDU_OCR_SECRET_KEY:
        logger.error("[OCR Service] 未配置百度 OCR API Key")
        return []
    
    # 获取 Access Token
    logger.info("[OCR Service] 获取百度 OCR Access Token...")
    access_token = await get_baidu_access_token()
    if not access_token:
        logger.error("[OCR Service] 获取 Access Token 失败")
        return []
    logger.debug(f"[OCR Service] Access Token 获取成功: {access_token[:20]}...")
    
    # 调用 OCR（不进行任何图像预处理）
    logger.info("[OCR Service] 调用百度 OCR API...")
    raw_text = await call_baidu_ocr(image_base64, access_token)
    if not raw_text:
        logger.error("[OCR Service] OCR 识别返回空")
        return []
    
    # 打印 OCR 原始文本（限制长度）
    text_preview = raw_text[:500] + "..." if len(raw_text) > 500 else raw_text
    logger.debug(f"[OCR Service] OCR 识别结果（前500字符）:\n{text_preview}\n")
    
    # 优先使用标准解析器（基于ocr_test.py的逻辑）
    logger.info("[OCR Service] 执行标准解析 (parse_receipt)...")
    raw_items = parse_receipt(raw_text)
    logger.debug(f"[OCR Service] 标准解析结果: {len(raw_items)} 个商品")
    if raw_items:
        logger.debug(f"[OCR Service] 解析详情: {json.dumps(raw_items, ensure_ascii=False, indent=2)}")
    
    # 如果标准解析失败，尝试智能列解析
    if not raw_items:
        logger.warning("[OCR Service] 标准解析失败，尝试智能列解析 (parse_receipt_smart)...")
        raw_items = parse_receipt_smart(raw_text)
        logger.debug(f"[OCR Service] 智能解析结果: {len(raw_items)} 个商品")
        if raw_items:
            logger.debug(f"[OCR Service] 解析详情: {json.dumps(raw_items, ensure_ascii=False, indent=2)}")
    
    # 如果仍然失败，回退到 LLM 解析
    if not raw_items:
        logger.warning("[OCR Service] 智能解析失败，尝试 LLM 解析 (call_llm_clean)...")
        raw_items = await call_llm_clean(raw_text) or []
        logger.debug(f"[OCR Service] LLM 解析结果: {len(raw_items)} 个商品")
        if raw_items:
            logger.debug(f"[OCR Service] 解析详情: {json.dumps(raw_items, ensure_ascii=False, indent=2)}")
    
    if not raw_items:
        logger.error("[OCR Service] 所有解析方式均失败，返回空列表")
        return []
    
    # LLM纠错（仅处理商品名）
    if USE_LLM_CORRECTION:
        logger.info(f"[OCR Service] 执行 LLM 纠错，输入 {len(raw_items)} 个商品...")
        corrected_items = await llm_correct(raw_items)
        logger.debug(f"[OCR Service] LLM 纠错结果: {len(corrected_items)} 个商品")
        # 检测是否有变化
        has_changes = len(corrected_items) != len(raw_items) or any(
            corrected_items[i].get('name') != raw_items[i].get('name') 
            for i in range(min(len(corrected_items), len(raw_items)))
        )
        if has_changes:
            logger.debug(f"[OCR Service] 纠错详情: {json.dumps(corrected_items, ensure_ascii=False, indent=2)}")
        else:
            logger.debug(f"[OCR Service] 纠错无变化，保持原样")
    else:
        logger.info("[OCR Service] LLM 纠错已禁用，跳过")
        corrected_items = raw_items
    
    # 食材匹配
    logger.info(f"[OCR Service] 执行食材匹配，输入 {len(corrected_items)} 个商品...")
    matched_items = match_ingredients(corrected_items)
    logger.debug(f"[OCR Service] 食材匹配结果: {len(matched_items)} 个商品")
    
    # 统计匹配情况
    matched_count = sum(1 for item in matched_items if item.get('mapped'))
    logger.info(f"[OCR Service] 匹配成功: {matched_count}/{len(matched_items)}")
    
    # 打印匹配详情
    matched_details = []
    for item in matched_items:
        status = "✓" if item.get('mapped') else "✗"
        detail = {
            "original": item.get('original_name'),
            "cleaned": item.get('cleaned_name'),
            "final": item.get('name'),
            "mapped": item.get('mapped'),
            "ingredient_id": item.get('ingredient_id')
        }
        matched_details.append(detail)
    logger.debug(f"[OCR Service] 匹配详情:\n{json.dumps(matched_details, ensure_ascii=False, indent=2)}")
    
    # 同名合并
    logger.info(f"[OCR Service] 执行同名合并，输入 {len(matched_items)} 个商品...")
    merged_items = merge_items(matched_items)
    logger.debug(f"[OCR Service] 合并结果: {len(merged_items)} 个商品（减少 {len(matched_items) - len(merged_items)} 个）")
    if merged_items:
        logger.debug(f"[OCR Service] 合并详情: {json.dumps(merged_items, ensure_ascii=False, indent=2)}")
    
    # 黑名单过滤
    logger.info(f"[OCR Service] 执行黑名单过滤，输入 {len(merged_items)} 个商品...")
    final_items = filter_blacklist(merged_items)
    logger.debug(f"[OCR Service] 过滤结果: {len(final_items)} 个商品（过滤 {len(merged_items) - len(final_items)} 个）")
    
    # 最终结果
    logger.info(f"\n{'='*80}")
    logger.info(f"[OCR Service] 处理完成！图片 #{image_index} 最终返回 {len(final_items)} 个食材")
    if final_items:
        for i, item in enumerate(final_items):
            logger.info(f"  [{i+1}] {item.get('name')} - ¥{item.get('price', 0):.2f} x {item.get('quantity', 1)}")
    logger.info(f"{'='*80}\n")
    
    return final_items


async def call_llm_clean(raw_text: str) -> Optional[List[Dict]]:
    """调用 LLM 解析（回退方案）"""
    if not raw_text.strip():
        return []
    
    prompt = f"""你是超市小票解析器。从以下OCR文本中提取商品，输出JSON数组。
每个元素必须包含: name, price, quantity。
规则：
- name: 商品名称（去除货号，如"小王子薯片/229011501685"→"小王子薯片"）
- price: 单价（浮点数，无则为0）
- quantity: 数量（整数，无则为1）
- 跳过"原价：xxx"这类行
- 只输出JSON数组，不要任何其他文字。
OCR文本：
{raw_text}"""
    
    headers = {
        "Content-Type": "application/json",
    }
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"
    
    payload = {
        "model": "deepseek-v4-flash",
        "messages": [
            {"role": "system", "content": "你是小票解析助手，只输出标准JSON数组格式。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(LLM_API_URL, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as response:
                if response.status == 200:
                    result = await response.json()
                    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                    
                    if not content.strip():
                        return []
                    
                    cleaned_content = content.strip()
                    if cleaned_content.startswith("```json"):
                        cleaned_content = cleaned_content[7:]
                    if cleaned_content.startswith("```"):
                        cleaned_content = cleaned_content[3:]
                    if cleaned_content.endswith("```"):
                        cleaned_content = cleaned_content[:-3]
                    cleaned_content = cleaned_content.strip()
                    
                    try:
                        parsed = json.loads(cleaned_content)
                        if isinstance(parsed, list):
                            return parsed
                    except json.JSONDecodeError:
                        pass
                return []
    except Exception:
        return []


# 标记是否已初始化
_initialized = False


def ensure_initialized() -> None:
    """
    确保食材映射和黑名单已加载（延迟初始化）
    只在第一次调用时执行，避免模块加载时的数据库连接问题
    """
    global _initialized
    if not _initialized:
        load_ingredient_maps()
        load_blacklist()
        _initialized = True


# 程序启动时加载映射（保留，但添加异常处理）
try:
    load_ingredient_maps()
    load_blacklist()
    _initialized = True
except Exception as e:
    logger.warning(f"[OCR Service] 启动时加载失败（稍后会延迟加载）: {e}")
    _initialized = False
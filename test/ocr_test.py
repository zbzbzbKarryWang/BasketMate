import re
import csv

# 食材数据类型
class Ingredient:
    def __init__(self, id: str, name: str, alias: str = None):
        self.id = id
        self.name = name
        self.alias = alias

# 从CSV文件加载食材数据
def load_ingredients(csv_path: str) -> list[Ingredient]:
    ingredients = []
    try:
        # 尝试不同路径
        import os
        paths_to_try = [csv_path, os.path.join(os.path.dirname(__file__), csv_path)]
        
        file_path = None
        for p in paths_to_try:
            if os.path.exists(p):
                file_path = p
                break
        
        if not file_path:
            print(f"文件不存在: {csv_path}")
            return ingredients
            
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            # 按行解析
            lines = content.strip().split('\n')
            # 跳过表头（第一行）
            for line in lines[1:]:
                if line.strip():
                        # 去掉可能的引号
                        sql = line.strip().strip('"')
                        # 从VALUES后面提取所有值
                        values_match = re.search(r"VALUES\s*\(\s*'([^']+)'\s*,\s*'([^']+)'", sql)
                        if values_match:
                            ingredient_id = values_match.group(1)
                            ingredient_name = values_match.group(2)
                            # 检查是否有alias字段
                            alias_match = re.search(r",\s*'([^']+)'\s*,\s*\d+\s*,\s*'", sql)
                            alias = alias_match.group(1) if alias_match else None
                            
                            ingredient = Ingredient(
                                id=ingredient_id,
                                name=ingredient_name,
                                alias=alias
                            )
                            ingredients.append(ingredient)
        print(f"成功从 {file_path} 加载 {len(ingredients)} 条食材")
    except Exception as e:
        print(f"加载食材数据失败: {e}")
    return ingredients

# 食材匹配函数
def match_ingredient(item_name: str, ingredients: list[Ingredient]) -> tuple[str, str] | None:
    """
    匹配商品名到食材
    如果商品名完全包含食材名或食材别名，返回 (食材ID, 食材名)
    否则返回 None
    """
    item_name_lower = item_name.lower()
    for ing in ingredients:
        # 检查食材名是否被商品名包含
        if ing.name.lower() in item_name_lower:
            return (ing.id, ing.name)
        # 检查别名是否被商品名包含
        if ing.alias and ing.alias.lower() in item_name_lower:
            return (ing.id, ing.name)
    return None

def parse_receipt(text: str, ingredients: list[Ingredient] = None) -> list[dict]:
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    
    # 识别格式：文本1特征为“品名/货号”，文本2特征为单独“品名”（无“/货号”）
    is_type1 = any('品名/货号' in l for l in lines)
    
    # 阶段1：过滤无用行
    clean_lines = []
    stop_keywords = ['件数']  # 文本1遇到“件数”停止
    if not is_type1:
        stop_keywords = []  # 文本2没有件数，可以不加
    
    skip_keywords = ['原价']  # 包含“原价”的行都丢掉
    
    # 找到表头结束位置（跳过品名/货号、单价、数量、小计这些行）
    header_end = 0
    for i, l in enumerate(lines):
        if re.search(r'品名', l):  # 表头开始
            header_end = i
            # 向后找到最后一个列标题行
            while header_end+1 < len(lines) and any(kw in lines[header_end+1] for kw in ['单价','数量','小计','金额']):
                header_end += 1
            break
    start_idx = header_end + 1  # 商品区域开始
    
    for i in range(start_idx, len(lines)):
        line = lines[i]
        # 遇到停止关键词，终止
        if any(kw in line for kw in stop_keywords):
            break
        # 跳过包含“原价”的行
        if any(kw in line for kw in skip_keywords):
            continue
        # 跳过表头关键词残留
        if any(kw in line for kw in ['品名','单价','数量','小计','金额','货号']):
            continue
        # 过滤无意义的行（如纯符号、空、过长数字串等）
        if not re.search(r'[\u4e00-\u9fff]', line) and not re.match(r'^\d+(\.\d+)?$', line):
            continue
        clean_lines.append(line)
    
    # 阶段2：提取商品
    items = []
    i = 0
    while i < len(clean_lines):
        line = clean_lines[i]
        # 商品名行：必须包含中文，或者包含斜杠且有数字
        if re.search(r'[\u4e00-\u9fff]', line) or ('/' in line and re.search(r'\d', line)):
            name = line
            i += 1
            # 如果名称行以数字或斜杠结尾，且下一行是纯整数，再下一行也是数字，则合并（处理换行名称）
            while i < len(clean_lines) and re.match(r'^\d+$', clean_lines[i]):
                if (name[-1].isdigit() or '/' in name) and i+1 < len(clean_lines) and re.match(r'^\d+(\.\d+)?$', clean_lines[i+1]):
                    name += clean_lines[i]
                    i += 1
                else:
                    break
            # 收集后续数字
            nums = []
            while i < len(clean_lines) and re.match(r'^\d+(\.\d+)?$', clean_lines[i]):
                nums.append(float(clean_lines[i]))
                i += 1
            
            # 构建商品
            if is_type1:
                item = build_item_type1(name, nums)
            else:
                item = build_item_type2(name, nums)
            if item:
                # 添加食材匹配
                if ingredients:
                    match_result = match_ingredient(item['name'], ingredients)
                    if match_result:
                        item['id'] = match_result[0]
                        item['ingredient_name'] = match_result[1]
                items.append(item)
        else:
            i += 1
    return items

def build_item_type1(raw_name: str, nums: list) -> dict:
    """文本1规则：数字个数 == 3 则全用，否则只取商品名+最后一个数字（小计）"""
    # 清洗名称
    if '/' in raw_name:
        name = raw_name.rsplit('/', 1)[0].strip()
    else:
        name = raw_name.strip()
    name = re.sub(r'^\d+\s*', '', name)
    if not name:
        return None
    
    price = 0.0
    qty = 1.0
    
    if len(nums) == 3:
        # 正好三列：单价、数量、小计
        price = round(nums[0], 2)
        qty = int(nums[1]) if nums[1] == int(nums[1]) else nums[1]
    else:
        # 列数不是3，只取最后一个为小计，其他忽略
        # 没有单价数量
        pass
    
    return {"name": name, "price": price, "quantity": qty}

def build_item_type2(raw_name: str, nums: list) -> dict:
    """文本2规则：五列：商品名、编号、单价、数量、小计（数字4个）"""
    name = re.sub(r'^\d+\s*', '', raw_name)  # 去前导序号
    if '/' in name:
        name = name.rsplit('/', 1)[0].strip()
    name = name.strip()
    if not name:
        return None
    
    price = 0.0
    qty = 1.0
    
    if len(nums) == 4:
        # 跳过第一个编号，第二个单价，第三个数量
        price = round(nums[1], 2)
        qty = int(nums[2]) if nums[2] == int(nums[2]) else nums[2]
    elif len(nums) >= 3:
        # 如果不足4个，可能也有编号？尝试智能丢弃
        # 简单处理：如果第一个是整数且较小，丢第一个
        if len(nums) >= 3 and nums[0] == int(nums[0]) and nums[0] < 10000:
            price = round(nums[1], 2) if len(nums) > 1 else 0
            qty = int(nums[2]) if len(nums) > 2 else 1
        else:
            price = round(nums[0], 2)
            qty = int(nums[1]) if len(nums) > 1 else 1
    else:
        # 只有小计
        pass
    
    return {"name": name, "price": price, "quantity": qty}

# 测试
if __name__ == "__main__":
    # 加载食材数据
    ingredients = load_ingredients('../frontend/app/docs/菜篮子/数据库/ingredients.csv')
    print(f"加载食材数量: {len(ingredients)}\n")
    
    text1 = """0112
众万加百货
NO.0103202604060207
2026.04.06
16:56
收银机：0103
收银员：0112
品名/货号
单价
数量
小计
小王子薯片/薯条系列/229011501685
2
16.85
翔达散称25.8系列/2290323011564
11.56
干辣椒/2260019001575
1.57
豆腐结/2260079003021
3.02
红花椒/2260089001123
1.12
带泥老姜/2210009000774
0.77
莲藕/2210090005221
5.22
黔裕泰黑胡椒粉35g/6976629402546
6.80
1.00
6.80
原味瓜子/2260122012628
12.62
二节鸭翅/2250290003320
3.32
鸡翅尖/2250270001896
1.89
后腿肉/2230600004919
4.91
黄瓜/2210142001737
1.73
新蒜苔/2210286004724
4.72
正大大码鲜鸡蛋20枚/6974395810961
原价：23.90
12.80
1.00
12.80
金针菇250g/6971652460068
3.00
1.00
3.00
前排/2230607012085
12.08
西红柿/2210161001824
1.82
红薯粉皮/2260077002934
2.93
梅花肉/2230608015184
15.18
泡豆腐/2260247005147
5.14
青花椒/2260098001008
1.00
魔芋豆腐/2211544002421
2.42
翔达散称12元系列/2290334014691
14.69
翔达散称19.8系列/2290322013460
13.46
翔达散称13.8系列/2290320019105
19.10
件数：26
数量：-
198.89
原价合计：
19.17
折让：
19.17
特价折让：
179.72
应付合计：
付款：银行扫码支付
179.72"""
    text2 = """品名
单价
数量
小计
1分葱
00150
7.36
0.122
0.90
2耳豆
00187
11.96
0.351
4.20
3蒜苗
00137
7.36
0.163
1.20
4特价螺丝椒
01122
5.96
0.419
2.50
5特价蔬果1元
11111
1.00
3.00
3.00"""
    print("===== 文本1 =====")
    for item in parse_receipt(text1, ingredients):
        print(item)
    print("\n===== 文本2 =====")
    for item in parse_receipt(text2, ingredients):
        print(item)
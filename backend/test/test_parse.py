"""
测试OCR解析函数
"""
import sys
import re
from typing import List, Dict, Optional

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


def parse_receipt(raw_text: str) -> List[Dict]:
    """
    标准小票解析器
    """
    lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
    
    if not lines:
        return []
    
    # 识别格式
    is_type1 = any('品名/货号' in l for l in lines)
    print(f"格式类型: {'文本1' if is_type1 else '文本2'}")
    
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
    
    print(f"\n过滤后行数: {len(clean_lines)}")
    
    # 阶段2：提取商品
    items = []
    i = 0
    while i < len(clean_lines):
        line = clean_lines[i]
        if re.search(r'[\u4e00-\u9fff]', line) or ('/' in line and re.search(r'\d', line)):
            name = line
            i += 1
            
            # 检查商品名行是否包含行内空格分隔的数字
            inline_nums: List[float] = []
            name_parts = name.split()
            if len(name_parts) > 1:
                for part in name_parts[1:]:
                    if re.match(r'^\d+(\.\d+)?$', part):
                        inline_nums.append(float(part))
                    else:
                        break
                name = ' '.join(name_parts[:len(name_parts) - len(inline_nums)]) if inline_nums else name
            
            # 继续收集后续的数字行
            while i < len(clean_lines) and re.match(r'^\d+(\.\d+)?$', clean_lines[i]):
                inline_nums.append(float(clean_lines[i]))
                i += 1
            
            nums = inline_nums
            
            if is_type1:
                item = build_item_type1(name, nums)
            else:
                item = None
            
            if item:
                items.append(item)
                print(f"  商品: {item['name']}, nums={nums}, price={item['price']}, quantity={item['quantity']}")
        else:
            i += 1
    
    return items


# OCR原始文本
raw_text = """品名/货号
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
19.10"""

print("="*60)
print("开始解析测试")
print("="*60)

items = parse_receipt(raw_text)

print("\n" + "="*60)
print(f"解析结果: 共 {len(items)} 个商品")
print("="*60)
for i, item in enumerate(items, 1):
    print(f"{i}. {item['name']}: {item['price']} x {item['quantity']}")

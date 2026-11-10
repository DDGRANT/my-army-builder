import os
import json
import pandas as pd

def build_database():
    print("正在读取 Excel 数据源...")
    
    # 1. 读取派系名称 (factions.xlsx)
    df_factions = pd.read_excel('factions.xlsx', header=None)
    factions_map = {}
    for _, row in df_factions.iterrows():
        raw_key = str(row[0]).strip()
        fac_name = str(row[1]).strip()
        fac_id = raw_key.replace("factions_screen_name_", "")
        factions_map[fac_id] = {
            "id": fac_id,
            "name": fac_name,
            "flag": f"assets/flags/{fac_id}.png"
        }

    # 2. 读取单位基础属性 (units_tables.xlsx)
    # [key, 汉化名, 大类, 子类别, 价格, Cap]
    df_units = pd.read_excel('units_tables.xlsx', header=None)
    units_dict = {}
    for _, row in df_units.iterrows():
        key = str(row[0]).strip()
        units_dict[key] = {
            "key": key,
            "name": str(row[1]).strip(),
            "category": str(row[2]).strip(),
            "class_type": str(row[3]).strip(),
            "cost": int(row[4]) if pd.notnull(row[4]) else 0,
            "cap": int(row[5]) if pd.notnull(row[5]) else 0
        }

    # 3. 读取单位战场属性 (unit_stats_land_tables.xlsx)
    df_stats = pd.read_excel('unit_stats_land_tables.xlsx', header=None)
    for _, row in df_stats.iterrows():
        key = str(row[0]).strip()
        if key in units_dict:
            units_dict[key]["stats"] = {
                "men": int(row[1]) if pd.notnull(row[1]) else 0,
                "guns": int(row[2]) if pd.notnull(row[2]) else 0,
                "accuracy": int(row[3]) if pd.notnull(row[3]) else 0,
                "reload": int(row[4]) if pd.notnull(row[4]) else 0,
                "melee_attack": int(row[5]) if pd.notnull(row[5]) else 0,
                "charge_bonus": int(row[6]) if pd.notnull(row[6]) else 0,
                "defense": int(row[7]) if pd.notnull(row[7]) else 0,
                "morale": int(row[8]) if pd.notnull(row[8]) else 0
            }

    # 4. 读取单位对应兵牌 (uniforms_tables.xlsx)
    df_uniforms = pd.read_excel('uniforms_tables.xlsx', header=None)
    uniforms_map = {}
    for _, row in df_uniforms.iterrows():
        fac_id = str(row[0]).strip()
        unit_key = str(row[1]).strip()
        icon = str(row[2]).strip()
        uniforms_map[(fac_id, unit_key)] = icon

    # 5. 读取派系单位归属权限 (units_to_exclusive_faction_permissions_tables.xlsx)
    df_perms = pd.read_excel('units_to_exclusive_faction_permissions_tables.xlsx', header=None)
    roster_by_faction = {fac_id: [] for fac_id in factions_map}
    
    # 特殊映射适配: AF_britain_1815 映射为 tow_032
    alias_fac = {"AF_britain_1815": "tow_032"}

    for _, row in df_perms.iterrows():
        unit_key = str(row[0]).strip()
        raw_fac = str(row[1]).strip()
        fac_id = alias_fac.get(raw_fac, raw_fac)
        perm = bool(row[2])

        if perm and unit_key in units_dict:
            unit_data = dict(units_dict[unit_key])
            # 获取对应的兵牌文件，不存在则取默认
            icon_name = uniforms_map.get((fac_id, unit_key), uniforms_map.get((raw_fac, unit_key), unit_key))
            unit_data["icon"] = f"assets/units/{icon_name}.png"
            
            if fac_id not in roster_by_faction:
                roster_by_faction[fac_id] = []
            roster_by_faction[fac_id].append(unit_data)

    output = {
        "factions": list(factions_map.values()),
        "rosters": roster_by_faction
    }

    os.makedirs("../data", exist_ok=True)
    with open("../data/army_data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print("构建成功！已生成 data/army_data.json 文件。")

if __name__ == "__main__":
    build_database()

"""Enrich data/venues.json with description / opening_hours / contact.

Deterministic: every random choice is seeded by the venue id, so re-running
the script overwrites each venue with identical values (idempotent).
Usage:  python scripts/enrich_venues.py   (from the backend directory)
"""
import json
import random
import re
from pathlib import Path

VENUES = Path(__file__).resolve().parent.parent / "data" / "venues.json"

# 开放时间按类型分档，同类型多个变体
HOURS = {
    "足球场": ["08:00-22:00", "07:00-23:00", "07:30-21:30"],
    "篮球场": ["07:00-23:00", "08:00-22:00", "06:00-23:30"],
    "羽毛球场": ["07:00-22:00", "08:00-23:00", "06:30-22:00"],
    "网球场": ["07:00-22:00", "06:30-23:00", "08:00-23:00"],
}

# 城市电话区号（数据中出现的城市）；未命中则生成 400 热线
AREA_CODE = {
    "上海": "021", "北京": "010", "广州": "020", "深圳": "0755",
    "杭州": "0571", "南京": "025", "西安": "029", "成都": "028",
    "武汉": "027", "重庆": "023", "天津": "022", "苏州": "0512",
    "东莞": "0769", "长沙": "0731", "郑州": "0371", "青岛": "0532",
    "合肥": "0551", "厦门": "0592", "沈阳": "024", "佛山": "0757",
    "哈尔滨": "0451", "昆明": "0871", "济南": "0531", "大连": "0411",
    "昆山": "0520", "太原": "0351", "南昌": "0791", "贵阳": "0851",
    "南宁": "0771", "兰州": "0931", "呼和浩特": "0471", "泉州": "0595",
    "烟台": "0535", "洛阳": "0379", "无锡": "0510", "常州": "0519",
    "石家庄": "0311", "温州": "0577", "绍兴": "0575", "徐州": "0516",
    "珠海": "0756", "中山": "0760", "惠州": "0752", "江门": "0750",
    "汕头": "0754", "遵义": "0852", "柳州": "0772", "桂林": "0773",
    "海口": "0898", "乌鲁木齐": "0991", "潍坊": "0536", "福州": "0591",
    "长春": "0431", "义乌": "0579", "南通": "0513", "唐山": "0315",
}

# 每类型三组句池：设施 / 特色 / 服务，拼成一段简介
FACILITY = {
    "足球场": [
        "场地铺设天然草皮，配地暖与排水系统，",
        "拥有标准11人制球场与附属训练场，",
        "看台设遮阳篷顶与无障碍观赛区，",
    ],
    "篮球场": [
        "比赛场地铺设进口枫木地板，",
        "馆内设主副两片标准球场与力量训练区，",
        "配备国际篮联认证篮板与24秒计时系统，",
    ],
    "羽毛球场": [
        "馆内设二十片标准场地与专业防眩目灯光系统，",
        "铺设国际认证运动地胶，配独立空调新风系统，",
        "拥有室内恒温球馆与专业穿线服务台，",
    ],
    "网球场": [
        "拥有硬地、红土多片室外球场与气膜室内馆，",
        "中心球场设可容纳数千名观众的环形看台，",
        "配备国际标准发球机与灯光夜场系统，",
    ],
}

FEATURE = {
    "足球场": [
        "达到国际A级赛事承办标准，",
        "曾承接职业联赛与青少年锦标赛，",
        "夜间灯光系统满足晚间赛事需求，",
    ],
    "篮球场": [
        "可承接职业联赛与各类商业赛事，",
        "看台视线无遮挡，现场氛围热烈，",
        "灯光照度满足高清转播标准，",
    ],
    "羽毛球场": [
        "场地硬度与灯光照度均按赛事标准设定，",
        "常年举办城市业余联赛与青少年等级赛，",
        "场地弹性适中，有效降低膝关节运动损伤，",
    ],
    "网球场": [
        "场地达到职业巡回赛级别，",
        "曾承接国际职业赛事与全国青少年巡回赛，",
        "夜场灯光照度满足电视转播要求，",
    ],
}

SERVICE = {
    "足球场": [
        "并提供青训营与球队冬训保障服务。",
        "配套球员休息室与新闻发布厅。",
        "支持赛事承办与球迷活动定制。",
    ],
    "篮球场": [
        "并提供青少年梯队培训与分时租赁。",
        "设更衣室、淋浴房与装备商店。",
        "支持企业联赛承办与包场训练。",
    ],
    "羽毛球场": [
        "并提供成人培训班与青少年梯队课程。",
        "设淋浴房、更衣室与球拍维修服务。",
        "支持场地包场与企业团建活动定制。",
    ],
    "网球场": [
        "并提供职业教练课程与球拍穿线服务。",
        "设球员休息室与体能训练房。",
        "支持赛事包场与会员场地预订。",
    ],
}


def city_of(location: str) -> str | None:
    m = re.match(r"^(.+?)市", location)
    return m.group(1) if m else None


def make_contact(rng: random.Random, location: str) -> str:
    city = city_of(location)
    code = AREA_CODE.get(city or "")
    if code:
        # 三位区号配 8 位号码，四位区号配 7 位，符合常见固话位长
        digits = 8 if len(code) == 3 else 7
        local = rng.randrange(6 * 10 ** (digits - 1), 9 * 10 ** (digits - 1))
        return f"{code}-{local}"
    return f"400-{rng.randrange(100, 1000)}-{rng.randrange(1000, 10000)}"


def make_description(rng: random.Random, name: str, vtype: str,
                     location: str) -> str:
    city = city_of(location) or "当地"
    facility = rng.choice(FACILITY[vtype])
    feature = rng.choice(FEATURE[vtype])
    service = rng.choice(SERVICE[vtype])
    return f"{name}坐落于{city}，{facility}{feature}{service}"


def main() -> None:
    venues = json.loads(VENUES.read_text(encoding="utf-8"))
    assert len(venues) == 60, f"expected 60 venues, got {len(venues)}"

    for v in venues:
        rng = random.Random(v["id"])  # 以 id 为种子，保证幂等
        v["description"] = make_description(rng, v["name"], v["type"],
                                            v["location"])
        v["opening_hours"] = rng.choice(HOURS[v["type"]])
        v["contact"] = make_contact(rng, v["location"])

    VENUES.write_text(
        json.dumps(venues, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"enriched {len(venues)} venues ({VENUES})")


if __name__ == "__main__":
    main()

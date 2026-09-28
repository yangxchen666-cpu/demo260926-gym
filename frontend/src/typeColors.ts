/** 类别双色映射：橙 / 宝蓝，画报线路色 */
const TYPE_COLOR: Record<string, string> = {
  体育馆: 'bg-flame',
  网球中心: 'bg-flame',
  音乐厅: 'bg-flame',
  篮球馆: 'bg-flame',
  游泳馆: 'bg-royal',
  剧院: 'bg-royal',
  会展中心: 'bg-royal',
  足球场: 'bg-royal',
}

export function typeColorClass(type: string): string {
  return TYPE_COLOR[type] ?? 'bg-ink'
}

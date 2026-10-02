/** 类别双色映射：橙 / 宝蓝，画报线路色 */
const TYPE_COLOR: Record<string, string> = {
  篮球场: 'bg-flame',
  网球场: 'bg-flame',
  足球场: 'bg-royal',
  羽毛球场: 'bg-royal',
}

export function typeColorClass(type: string): string {
  return TYPE_COLOR[type] ?? 'bg-ink'
}

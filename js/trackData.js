// 赛道数据：QQ飞车「城镇高速公路」风格环线（全长 2948m）
// 几何由 js/trackOps.js 的 turtle 指令生成，见 js/centerline.js

export const TRACK = {
  name: '城镇高速公路',
  subName: 'TOWN HIGHWAY',
  width: 19,
  laps: 3,
  // 加速带：s 为赛道进度比例(0-1)，offset 为横向偏移(米，正=右侧)
  pads: [
    { s: 0.035, offset: 0, len: 12 },
    { s: 0.155, offset: -3, len: 10 },
    { s: 0.30, offset: 3, len: 10 },
    { s: 0.435, offset: 0, len: 12 },
    { s: 0.575, offset: -2.5, len: 9 },
    { s: 0.70, offset: 0, len: 10 },
    { s: 0.845, offset: 2.5, len: 10 },
    { s: 0.945, offset: 0, len: 10 },
  ],
  startS: 0.006,                    // 起跑线里程比例
  grid: { rowGap: 11, latGap: 5.2 }, // 起跑格间距
};
import type { AppData } from "./types";

/**
 * 预置：
 * - 两处场馆（圣玛丽教堂 / 星河音乐厅）
 * - 三组音栓（Principal 8' 主音栓 / Trumpet 8' 簧片音栓 / Mixtur IV 混合音栓）
 * - 九根音管，每管记录音高、音分偏差、温湿度、簧片状态与备注
 */
export function createSeedData(): AppData {
  return {
    version: 1,
    venues: [
      { id: "v-mary", name: "圣玛丽教堂", subtitle: "St. Mary Church · 北堂楼座" },
      { id: "v-hall", name: "星河音乐厅", subtitle: "Galaxy Concert Hall · A 厅" },
    ],
    stops: [
      { id: "s-principal", venueId: "v-mary", name: "Principal 8'", kind: "主音栓" },
      { id: "s-trumpet", venueId: "v-mary", name: "Trumpet 8'", kind: "簧片音栓" },
      { id: "s-mixtur", venueId: "v-hall", name: "Mixtur IV", kind: "混合音栓" },
    ],
    pipes: [
      // Principal 8'（主音栓）
      {
        id: "p-01",
        stopId: "s-principal",
        code: "P-01",
        measurement: {
          pitch: "C4",
          cents: 2,
          temperature: 20.4,
          humidity: 48,
          reed: "normal",
          note: "音准稳定",
          updatedAt: "2026-09-22T09:10:00.000Z",
        },
      },
      {
        id: "p-02",
        stopId: "s-principal",
        code: "P-02",
        measurement: {
          pitch: "G4",
          cents: -3,
          temperature: 20.6,
          humidity: null,
          reed: "normal",
          note: "",
          updatedAt: "2026-09-22T09:16:00.000Z",
        },
      },
      {
        id: "p-03",
        stopId: "s-principal",
        code: "P-03",
        measurement: {
          pitch: "C5",
          cents: 9,
          temperature: 20.5,
          humidity: 47,
          reed: "normal",
          note: "换季偏音，需二次复测",
          updatedAt: "2026-09-22T09:24:00.000Z",
        },
      },
      // Trumpet 8'（簧片音栓）
      {
        id: "p-04",
        stopId: "s-trumpet",
        code: "P-04",
        measurement: {
          pitch: "C4",
          cents: 1,
          temperature: 20.8,
          humidity: 45,
          reed: "normal",
          note: "",
          updatedAt: "2026-09-22T10:02:00.000Z",
        },
      },
      {
        id: "p-05",
        stopId: "s-trumpet",
        code: "P-05",
        measurement: {
          pitch: "E4",
          cents: 4,
          temperature: 20.7,
          humidity: 46,
          reed: "abnormal",
          note: "",
          updatedAt: "2026-09-22T10:10:00.000Z",
        },
      },
      {
        id: "p-06",
        stopId: "s-trumpet",
        code: "P-06",
        measurement: {
          pitch: "A4",
          cents: -14,
          temperature: null,
          humidity: null,
          reed: "abnormal",
          note: "簧舌磨损，已预约更换",
          updatedAt: "2026-09-22T10:21:00.000Z",
        },
      },
      // Mixtur IV（混合音栓）
      {
        id: "p-07",
        stopId: "s-mixtur",
        code: "P-07",
        measurement: {
          pitch: "C5",
          cents: 0,
          temperature: 22.1,
          humidity: 52,
          reed: "normal",
          note: "",
          updatedAt: "2026-09-22T11:05:00.000Z",
        },
      },
      {
        id: "p-08",
        stopId: "s-mixtur",
        code: "P-08",
        measurement: {
          pitch: "E5",
          cents: -2,
          temperature: 22.0,
          humidity: 51,
          reed: "normal",
          note: "高区泛音正常",
          updatedAt: "2026-09-22T11:12:00.000Z",
        },
      },
      {
        id: "p-09",
        stopId: "s-mixtur",
        code: "P-09",
        measurement: {
          pitch: "G5",
          cents: 7,
          temperature: null,
          humidity: 52,
          reed: "normal",
          note: "",
          updatedAt: "2026-09-22T11:20:00.000Z",
        },
      },
    ],
    maintenances: [],
    batches: [],
    seq: 0,
  };
}

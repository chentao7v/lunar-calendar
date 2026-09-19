import fetch from "cross-fetch";
import { Detail, ActionPanel, Action, LocalStorage, environment } from "@raycast/api";
import { useState, useMemo, useEffect } from "react";
import { Solar, HolidayUtil } from "lunar-javascript";

import zhTranslations from "../locales/zh.json";
import enTranslations from "../locales/en.json";

// 国际化翻译函数
function t(key: keyof typeof zhTranslations): string {
  const lang = environment.localization?.language || "en";
  const translations = lang.startsWith("zh") ? zhTranslations : enTranslations;
  return translations[key] || zhTranslations[key];
}

// API 返回的节假日类型定义
interface HolidayItem {
  holiday: boolean; // true 为放假，false 为调休上班
  name: string; // 节假日名称
  wage?: number;
  date?: string;
  rest?: number;
}

interface HolidayMap {
  [dateStr: string]: HolidayItem; // Key 格式: YYYY-MM-DD
}

export default function Command() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [holidays, setHolidays] = useState<HolidayMap>({});

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  // 1. 动态加载节假日数据（带 LocalStorage 缓存）
  useEffect(() => {
    async function loadHolidays() {
      const cacheKey = `holidays_${year}`;

      // 先尝试从本地缓存读取
      const cachedData = await LocalStorage.getItem<string>(cacheKey);
      if (cachedData) {
        try {
          setHolidays(JSON.parse(cachedData));
          return;
        } catch (e) {
          console.error("解析本地缓存失败", e);
        }
      }

      // 从网络 API 获取最新数据并更新缓存
      try {
        const response = await fetch(`https://timor.tech/api/holiday/year/${year}/`);
        const json = (await response.json()) as { code: number; holiday?: HolidayMap };

        if (json.code === 0 && json.holiday) {
          setHolidays(json.holiday);
          await LocalStorage.setItem(cacheKey, JSON.stringify(json.holiday));
        }
      } catch (error) {
        console.error(`获取 ${year} 年节假日数据失败:`, error);
      }
    }

    loadHolidays();
  }, [year]);

  // 2. 构建当月日历数据
  const calendarData = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const firstDay = new Date(year, month - 1, 1);
    let firstDayOfWeek = firstDay.getDay() - 1;
    if (firstDayOfWeek === -1) firstDayOfWeek = 6;

    const totalDays = new Date(year, month, 0).getDate();
    const cells = [];

    // 上月补齐
    const prevMonthTotalDays = new Date(year, month - 1, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i;
      const m = month === 1 ? 12 : month - 1;
      const y = month === 1 ? year - 1 : year;
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const solar = Solar.fromYmd(y, m, d);
      const dayOfWeek = new Date(y, m - 1, d).getDay();

      cells.push({
        day: d,
        isCurrentMonth: false,
        solar,
        dateStr,
        lunarText: getLunarText(solar, holidays[dateStr]),
        holidayStatus: getHolidayStatus(solar, holidays[dateStr]),
        isToday: false,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      });
    }

    // 当月天数
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const solar = Solar.fromYmd(year, month, d);
      const dayOfWeek = new Date(year, month - 1, d).getDay();

      cells.push({
        day: d,
        isCurrentMonth: true,
        solar,
        dateStr,
        lunarText: getLunarText(solar, holidays[dateStr]),
        holidayStatus: getHolidayStatus(solar, holidays[dateStr]),
        isToday: dateStr === todayStr,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      });
    }

    // 下月补齐
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const m = month === 12 ? 1 : month + 1;
        const y = month === 12 ? year + 1 : year;
        const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const solar = Solar.fromYmd(y, m, d);
        const dayOfWeek = new Date(y, m - 1, d).getDay();

        cells.push({
          day: d,
          isCurrentMonth: false,
          solar,
          dateStr,
          lunarText: getLunarText(solar, holidays[dateStr]),
          holidayStatus: getHolidayStatus(solar, holidays[dateStr]),
          isToday: false,
          isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        });
      }
    }

    return cells;
  }, [year, month, holidays]);

  const markdown = useMemo(() => {
    const fullCalendarSvg = generateFullCalendarSvg(calendarData);

    // Markdown 标题多语言适配
    const lang = environment.localization?.language || "en";
    let titleText = "";
    if (lang.startsWith("zh")) {
      titleText = `${year}年 ${month}月`;
    } else {
      const monthName = new Date(year, month - 1).toLocaleString("en-US", { month: "long" });
      titleText = `${monthName} ${year}`;
    }

    return `# ${titleText}\n\n![Calendar](${fullCalendarSvg})`;
  }, [year, month, calendarData]);

  const nextMonth = () => setCurrentDate(new Date(year, month, 1));
  const prevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const resetToday = () => setCurrentDate(new Date());

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action title={t("nextMonth")} shortcut={{ modifiers: ["cmd"], key: "arrowRight" }} onAction={nextMonth} />
          <Action title={t("prevMonth")} shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }} onAction={prevMonth} />
          <Action title={t("today")} shortcut={{ modifiers: ["cmd"], key: "t" }} onAction={resetToday} />
        </ActionPanel>
      }
    />
  );
}

// 判断是否有休假/补班状态（API 优先，失败时回退到 lunar-javascript 本地逻辑）
function getHolidayStatus(solar: Solar, holidayItem?: HolidayItem): { isHoliday?: boolean; isWork?: boolean } {
  if (holidayItem) {
    return {
      isHoliday: holidayItem.holiday,
      isWork: !holidayItem.holiday,
    };
  }

  // 降级使用 lunar-javascript 本地调休数据
  const h = HolidayUtil.getHoliday(solar.getYear(), solar.getMonth(), solar.getDay());
  if (h) {
    return {
      isHoliday: !h.isWork(),
      isWork: h.isWork(),
    };
  }

  return {};
}

// 获取农历或节日文本
function getLunarText(solar: Solar, holidayItem?: HolidayItem): string {
  // 1. 如果有 API 返回的假期名称（如中秋节、国庆节），优先展示
  if (holidayItem && holidayItem.holiday && holidayItem.name) {
    return holidayItem.name;
  }

  // 2. 核心阳历节日白名单（过滤掉像“全国国防教育日”这类冷门纪念日）
  const mainSolarFestivals = [
    "元旦",
    "妇女节",
    "植树节",
    "劳动节",
    "青年节",
    "儿童节",
    "建党节",
    "建军节",
    "教师节",
    "国庆节",
  ];
  const solarFestivals = solar.getFestivals();
  for (const f of solarFestivals) {
    if (mainSolarFestivals.some((m) => f.includes(m))) {
      if (f.includes("国庆")) return "国庆节";
      if (f.includes("元旦")) return "元旦";
      if (f.includes("劳动")) return "劳动节";
      if (f.includes("教师")) return "教师节";
      if (f.includes("儿童")) return "儿童节";
      if (f.includes("妇女")) return "妇女节";
      return f;
    }
  }

  const lunar = solar.getLunar();

  // 3. 24 节气（秋分、白露等）
  const jieQi = lunar.getJieQi();
  if (jieQi) return jieQi;

  // 4. 传统农历节日白名单
  const mainLunarFestivals = ["除夕", "春节", "元宵节", "端午节", "七夕节", "中秋节", "重阳节", "腊八节"];
  const lunarFestivals = lunar.getFestivals();
  for (const f of lunarFestivals) {
    if (mainLunarFestivals.includes(f)) {
      return f;
    }
  }

  // 5. 农历初一展示月份，其余展示初几/几十
  const lunarDay = lunar.getDayInChinese();
  if (lunarDay === "初一") {
    return `${lunar.getMonthInChinese()}月`;
  }

  return lunarDay;
}

// 补充日历单元格类型
interface CalendarCell {
  day: number;
  isCurrentMonth: boolean;
  solar: Solar;
  dateStr: string;
  lunarText: string;
  holidayStatus: { isHoliday?: boolean; isWork?: boolean };
  isToday: boolean;
  isWeekend: boolean;
}

// 渲染整张完整月历 SVG
function generateFullCalendarSvg(calendarData: CalendarCell[]) {
  const fontFamily = "system-ui, sans-serif";
  const colWidth = 100;
  const rowHeight = 85;
  const headerHeight = 40;

  const totalWidth = colWidth * 7;
  const rowCount = Math.ceil(calendarData.length / 7);
  const totalHeight = headerHeight + rowCount * rowHeight;

  // 表头
  const headers = [
    { text: "一", color: "#718096" },
    { text: "二", color: "#718096" },
    { text: "三", color: "#718096" },
    { text: "四", color: "#718096" },
    { text: "五", color: "#718096" },
    { text: "六", color: "#EB3434" },
    { text: "日", color: "#EB3434" },
  ];

  const headerSvg = headers
    .map((h, i) => {
      const centerX = i * colWidth + colWidth / 2;
      return `<text x="${centerX}" y="24" font-size="16" font-weight="600" fill="${h.color}" text-anchor="middle" font-family="${fontFamily}">${h.text}</text>`;
    })
    .join("");

  const cardW = 60;
  const cardH = 60;

  const badgeW = 18;
  const badgeH = 18;

  // 渲染日期网格
  const cellsSvg = calendarData
    .map((item, idx) => {
      const col = idx % 7;
      const row = Math.floor(idx / 7);

      const startX = col * colWidth;
      const startY = headerHeight + row * rowHeight;

      const centerX = startX + colWidth / 2;
      const centerY = startY + rowHeight / 2;

      const rectX = centerX - cardW / 2;
      const rectY = centerY - cardH / 2;

      let rectSvg = "";
      let textColor = item.isCurrentMonth ? "#1a202c" : "#a0aec0";
      let lunarColor = item.isCurrentMonth ? "#718096" : "#cbd5e0";
      let badgeSvg = "";

      if (item.isCurrentMonth && item.isWeekend) {
        textColor = "#EB3434";
        lunarColor = "#EB3434";
      }

      // 调休/放假处理（API 数据或本地兜底数据）
      if (item.holidayStatus.isWork) {
        // 班
        textColor = "#4E5877";
        lunarColor = "#4E5877";
        const bX = rectX + cardW - badgeW / 2;
        const bY = rectY - badgeH / 2;
        badgeSvg = `
          <rect x="${bX}" y="${bY}" width="${badgeW}" height="${badgeH}" rx="4" fill="#4E5877"/>
          <text x="${bX + badgeW / 2}" y="${bY + 13}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="${fontFamily}">班</text>
        `;
      } else if (item.holidayStatus.isHoliday) {
        // 休（法定节假日背景 #FA52520A）
        rectSvg = `<rect x="${rectX}" y="${rectY}" width="${cardW}" height="${cardH}" rx="10" fill="#FA52520A"/>`;
        textColor = "#EB3434";
        lunarColor = "#EB3434";
        const bX = rectX + cardW - badgeW / 2;
        const bY = rectY - badgeH / 2;
        badgeSvg = `
          <rect x="${bX}" y="${bY}" width="${badgeW}" height="${badgeH}" rx="4" fill="#EB3434"/>
          <text x="${bX + badgeW / 2}" y="${bY + 13}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="${fontFamily}">休</text>
        `;
      }

      // 今天：边框 #4E6EF2（优先级最高，覆盖背景/加上“今”字角标）
      if (item.isToday) {
        rectSvg = `<rect x="${rectX}" y="${rectY}" width="${cardW}" height="${cardH}" rx="10" fill="none" stroke="#4E6EF2" stroke-width="2"/>`;
        textColor = "#4E6EF2";
        lunarColor = "#4E6EF2";

        const bX = rectX + cardW - badgeW / 2;
        const bY = rectY - badgeH / 2;
        badgeSvg = `
          <rect x="${bX}" y="${bY}" width="${badgeW}" height="${badgeH}" rx="4" fill="#4E6EF2"/>
          <text x="${bX + badgeW / 2}" y="${bY + 13}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="${fontFamily}">今</text>
        `;
      }

      return `
        <g>
          ${rectSvg}
          ${badgeSvg}
          <text x="${centerX}" y="${centerY - 5}" font-size="24" font-weight="600" fill="${textColor}" text-anchor="middle" dominant-baseline="middle" font-family="${fontFamily}">${item.day}</text>
          <text x="${centerX}" y="${centerY + 16}" font-size="12" font-weight="500" fill="${lunarColor}" text-anchor="middle" font-family="${fontFamily}">${item.lunarText}</text>
        </g>
      `;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}">
    ${headerSvg}
    ${cellsSvg}
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

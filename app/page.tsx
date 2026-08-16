"use client";

import { useState, useEffect, useRef } from "react";
import { Rnd } from "react-rnd";
import { INDICATOR_SECTIONS, type IndicatorRow } from "@/lib/indicators";
import { API_CONNECTION_VARIANTS, SCOPE_LABELS, type ConnectionScope } from "@/lib/api-connections";
import { PATIENT_FIELD_LABELS, formatPatientFieldValue, type PatientRecord } from "@/lib/patient-fields";
import {
  DOCTOR_FIELD_LABELS,
  DEPARTMENT_STAT_FIELD_LABELS,
  formatLpzFieldValue,
  type LpzEntityRecord,
} from "@/lib/lpz-object-fields";
import { getHospitalTheme } from "@/lib/hospital-themes";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type ElementType = "block" | "heading" | "text" | "button" | "list" | "clock" | "image" | "chart";

// "📈 Графік" — 5 базових типів (Recharts), дані знімок на момент додавання
// (як "Список" — не живі, повторне підключення часового джерела для
// графіків поки не зроблено, лише для "Картки КПІ" вище). Джерело —
// той самий /api/indicators/* куб, що й "Список"/"Картка КПІ" (rows),
// просто замість плиток/таблиці малюється справжня діаграма.
type ChartKind = "bar" | "line" | "area" | "pie" | "scatter";
// Палітра — ті самі акцентні кольори, що вже вживані в панелях кубів
// (cyan-700/orange-700 тощо), щоб графік не випадав зі стилю конструктора.
const CHART_PALETTE = ["#0e7490", "#c2410c", "#7c3aed", "#059669", "#db2777", "#ca8a04", "#334155"];

// Класи ПОВНІСТЮ статичні (не шаблонні рядки з інтерполяцією кольору) —
// Tailwind JIT сканує сирий текст файлу на збіг із реальними назвами
// класів; динамічно зібраний `text-${accent}-900` він не знайде й не
// згенерує потрібний CSS. Тому 2 готові набори класів (під колір панелі
// куба), а не один параметризований.
const CHART_ADDER_STYLES = {
  cyan: {
    section: "pt-2 border-t border-cyan-200 space-y-1.5",
    label: "text-[10px] font-bold text-cyan-900",
    button:
      "w-full bg-white hover:bg-cyan-100 disabled:opacity-50 text-cyan-800 font-medium py-1.5 rounded-md text-xs border border-cyan-300",
  },
  orange: {
    section: "pt-2 border-t border-orange-200 space-y-1.5",
    label: "text-[10px] font-bold text-orange-900",
    button:
      "w-full bg-white hover:bg-orange-100 disabled:opacity-50 text-orange-800 font-medium py-1.5 rounded-md text-xs border border-orange-300",
  },
} as const;

// Захист від "зниклих" плаваючих панелей: якщо збережена (localStorage чи
// імпортований JSON) позиція опиняється поза поточним вікном — напр. проєкт
// зберігали на великому екрані, а відкрили на меншому — хендл (верхній край)
// стає недосяжним і перетягнути панель неможливо. Тому притискаємо позицію
// так, щоб хендл завжди лишався в межах видимої області.
//
// На МОМЕНТ монтування (перший useEffect) window.innerWidth/innerHeight у
// частини браузерів ще не встигають виставитись (фонова вкладка, дуже
// раннє виконання ефекту до першого layout) і читаються як 0 — тоді
// maxX/maxY теж стають 0, і обидві панелі силоміць притискаються до (0,0),
// зливаючись в одному кутку. Це саме "зліт" панелі, від якого захищається
// ця функція, а не рідкісний винятковий випадок: тому нульовий/несповна
// розумний розмір вікна ігнорується — позиція повертається як є, без
// зіпсованого клампу, а автозбереження (нижче) не встигає затерти добре
// значення в localStorage браузерним "0×0".
function clampPanelPos(pos: { x: number; y: number }): { x: number; y: number } {
  if (typeof window === "undefined") return pos;
  if (window.innerWidth < 100 || window.innerHeight < 100) return pos;
  const maxX = Math.max(window.innerWidth - 60, 0);
  const maxY = Math.max(window.innerHeight - 40, 0);
  return {
    x: Math.min(Math.max(pos.x, 0), maxX),
    y: Math.min(Math.max(pos.y, 0), maxY),
  };
}

// Fade-маска на краях прокручуваного списку (1:1 з utils.js:updateFadeMask
// у hospital-analytics, public/js/utils.js) — розмиває верхній/нижній край
// списку в прозорість, і зникає з того боку, де прокручувати вже нікуди
// (щоб не затуляти перший/останній пункт). Реагує на реальну позицію
// скролу через 'scroll' — на відміну від решти перенесених звідти речей,
// це не окремий об'єкт-пресет, а ефект самого типу "Список".
const SCROLL_FADE_SIZE = 32;
function applyScrollFadeMask(el: HTMLElement) {
  const pos = el.scrollTop;
  const extent = el.scrollHeight - el.clientHeight;
  const atStart = pos <= 2;
  const atEnd = pos >= extent - 2;
  let mask: string;
  if (extent <= 0 || (atStart && atEnd)) {
    mask = "none";
  } else if (atStart) {
    mask = `linear-gradient(180deg, #000 0, #000 calc(100% - ${SCROLL_FADE_SIZE}px), transparent 100%)`;
  } else if (atEnd) {
    mask = `linear-gradient(180deg, transparent 0, #000 ${SCROLL_FADE_SIZE}px, #000 100%)`;
  } else {
    mask = `linear-gradient(180deg, transparent 0, #000 ${SCROLL_FADE_SIZE}px, #000 calc(100% - ${SCROLL_FADE_SIZE}px), transparent 100%)`;
  }
  el.style.webkitMaskImage = mask;
  el.style.maskImage = mask;
}
// Callback ref, не useEffect — renderCanvasNode викликається як звичайна
// функція (не хук-компонент) для кожного елемента полотна в циклі, тож
// хуки тут недоступні. dataset-прапорець захищає від повторної реєстрації
// 'scroll'-слухача при кожному ре-рендері (React викликає ref-колбек лише
// на attach/detach DOM-вузла, але той самий вузол React може перевикликати
// колбеком, якщо сам колбек — нова функція; тут він стабільний module-level).
const attachScrollFadeMask = (node: HTMLDivElement | null) => {
  if (!node || node.dataset.fadeMaskInit) return;
  node.dataset.fadeMaskInit = "1";
  const update = () => applyScrollFadeMask(node);
  update();
  node.addEventListener("scroll", update);
};

const LEVEL_COLORS = [
  "#2563eb", // 1 рівень
  "#10b981", // 2 рівень
  "#ec4899", // 3 рівень
  "#f97316", // 4 рівень
  "#8b5cf6", // 5 рівень
];

const TYPE_LABELS: Record<ElementType, string> = {
  block: "Блок",
  heading: "Заголовок",
  text: "Текст",
  button: "Кнопка",
  list: "Список",
  clock: "Годинник",
  image: "Зображення",
  chart: "Графік",
};

interface ListColumn {
  id: string;
  label: string;
  width?: number; // відносна вага (flex-grow), за замовчуванням 1
}

interface CanvasElement {
  id: number;
  pageId: string;
  isGlobal?: boolean;
  cascadeGlobal?: boolean; // якщо true — усі вкладені елементи успадковують видимість ЦЬОГО елемента (і на "всіх сторінках", і на конкретних extraPageIds)
  extraPageIds?: string[]; // додаткові конкретні сторінки (крім власної pageId), де показувати елемент, без isGlobal
  excludeFromCascade?: boolean; // розірвати каскад від предків саме тут — цей елемент і все вкладене в нього більше не успадковує їхню видимість
  type: ElementType;
  content: string;
  width: number;
  height: number;
  x: number;
  y: number;
  textColor: string;
  padding: number;
  borderRadius: number;
  fontSize: number;
  lineHeight?: number; // множник міжрядкового інтервалу (CSS line-height, unitless); без значення — типовий leading-normal (1.5)
  parentId: number | null;
  customBgColor?: string;
  imageUrl?: string; // джерело для type: "image" (шлях у public/, напр. /logos/khotyn.svg)
  bgOpacity?: number; // 0..1, прозорість фону елемента
  meshBg?: boolean; // анімований mesh-фон замість звичайного суцільного фону (перекриває customBgColor)
  meshSpeed?: number; // множник швидкості анімації (1 = дефолт, 18с/26с як в оригіналі)
  meshIntensity?: number; // 0..100, загальна непрозорість mesh-шару
  meshColors?: string[]; // 1-5 кастомних кольорів замість дефолтної палітри Хотина

  // Динамічна рамка — тільки для елементів, вкладених у батька
  // (parentId !== null). Перемикач + товщина + крутизна переходу на
  // КОЖНОМУ елементі окремо (а не властивість батька) — рамка кольору
  // батьківського поля, накладена на власні зовнішні frameThickness px
  // елемента, що згасає в прозорість градієнтом по експоненті (від повного
  // кольору поля на зовнішньому краї до повної прозорості на внутрішньому
  // контурі). Округлення кутів рамки НЕ своє — береться з borderRadius
  // самого батьківського поля (renderCanvasNode: framePar?.borderRadius),
  // щоб рамка завжди повторювала форму поля, а не мала окрему
  // розсинхронізовану ручку.
  frame?: boolean;
  frameThickness?: number; // px
  frameFade?: number; // крутизна експоненційного згасання прозорості (0 = лінійно)

  // "Список" (type: "list") — конфігурація стовпців таблиці
  columns?: ListColumn[];
  // Рядок списку (дитина list-елемента зі стовпцями) — значення по кожному стовпцю
  columnValues?: Record<string, string>;
  // Рядки списку — два стековані рядки (основний content + дрібніший підпис
  // знизу, ВЕЛИКИМИ) замість колонок поруч. 1:1 з .doc-item з hospital-
  // analytics (ім'я над посадою) — для списків, де потрібен саме такий
  // вигляд рядка, а не таблична колонка "Поле"/"Значення".
  stackedRows?: boolean;
  // Підпис під основним content рядка — використовується лише коли
  // stackedRows === true на батьківському списку.
  subContent?: string;
  // Ключ зв'язку між рядками РІЗНИХ списків на тій самій сторінці — 1:1 із
  // старим принципом census-row[data-doctor] ↔ doc-item[data-doctor]
  // (utils.js:loadCensus): клік на рядку з linkKey підсвічує (рожеве
  // світіння) і прокручує до всіх ІНШИХ рядків з тим самим linkKey, де б
  // вони не були — напр. пацієнт ↔ його лікар в ординаторській.
  linkKey?: string;

  // Налаштування появи
  showOnHoverId?: number | null; // ціль за замовчуванням, якщо для сторінки немає власного запису в *TargetByPage
  showOnClickId?: number | null;
  hoverTargetByPage?: Record<string, number | null>; // pageId -> ціль (null = свідомо нічого не викликати саме на цій сторінці)
  clickTargetByPage?: Record<string, number | null>;
  isTriggerTarget?: boolean;

  // Налаштування шрифтів
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right" | "justify";

  targetPageId?: string | null;

  hoverContent?: string;      
  hoverBgColor?: string;
  hoverTextColor?: string;
  glowColor?: string;
  glowBlur?: number;

  activeContent?: string;     
  activeBgColor?: string;
  activeTextColor?: string;
  activeScale?: number;
  activeOffsetY?: number;
  activeGlowColor?: string;
  activeGlowBlur?: number;
  activeWidthOffset?: number;  
  activeHeightOffset?: number; 

  isToggle?: boolean;
  isPressed?: boolean;
  groupExclusive?: boolean; // клік активує лише цю кнопку — всі сестри з тим самим parentId і groupExclusive=true втрачають isPressed (як пігулки років у старому проекті)

  // Зв'язок "пігулка року" ↔ "КПІ лікарні": спільний kpiGroupId з'єднує
  // кнопку-пігулку (задає kpiYear — рік для запиту, null/undefined = весь
  // час) з текстовими полями значень усередині плиток КПІ (задають kpiField
  // — яке саме поле відповіді показувати). Клік на пігулці тягне
  // /api/hospital-summary?year=… і живцем оновлює content усіх текстових
  // полів з тим самим kpiGroupId — заміна ручного вибору року в панелі.
  kpiGroupId?: string;
  kpiYear?: number | null;
  kpiField?: "total_cases" | "unique_patients" | "deaths" | "death_rate_pct" | "avg_age" | "avg_bed_days";

  // Позначають число/підпис усередині "📊 Картка КПІ" як ПОСТІЙНІ посадочні
  // місця (число завжди зверху, підпис завжди знизу — сам шаблон це
  // гарантує) — за цими прапорцями handleBindLiveIndicator знаходить
  // потрібну дитину серед children обраного елемента, з якого боку його б
  // не виділили (клікнули на числі, підписі чи на самій рамці).
  isKpiNumberSlot?: boolean;
  isKpiLabelSlot?: boolean;

  // Пряме підключення числового посадочного місця картки до "живого"
  // показника (з довідника "📡 Живі показники" — лише 4 куби, що дають РІВНО
  // один рядок на період за обраним контекстом). "Універсальний вузол": усе,
  // КРІМ значень, зафіксованих одразу у формі кубу (рівень/напрямок/
  // відділення/зміна доби), може прийти пізніше з ПІДКЛЮЧЕНОГО вузла через
  // "🔗 Зв'язки", а не бути вбитим у params назавжди:
  // - ПЕРІОД — часовий вузол (set-year/set-month/set-day → timeContext,
  //   окремий механізм нижче, накопичується по одиницях).
  // - МКХ-10 (лише source: "diagnoses") — діагностичний вузол (set-icd,
  //   PARAM_ACTION_KEY, перезаписує params.icd).
  // - Лікар (лише source: "doctor-hierarchy") — лікарський вузол (set-doctor,
  //   PARAM_ACTION_KEY, перезаписує params.doctorId).
  // Доки всього необхідного не підключено (період завжди, + МКХ-10/лікар для
  // відповідних джерел) — content лишається "—" (resolveLiveIndicatorValue).
  liveBinding?: {
    source: "hierarchy" | "doctor-hierarchy" | "readmissions" | "diagnoses";
    field: string;
    suffix?: string;
    params: Record<string, string>;
  };

  // "📈 Графік" (type: "chart") — знімок рядків куба (chartData) на момент
  // додавання + яке поле мітка/X (chartLabelField), які поля значення/Y
  // (chartValueFields — масив, бо стовпчикова/лінійна/площинна можуть
  // малювати кілька серій одразу; секторна/точкова використовують лише
  // chartValueFields[0]). Для "Точкова" chartLabelField теж числове поле
  // (X-метрика), а не текстова мітка — renderChartBody сам розрізняє за
  // chartKind.
  chartKind?: ChartKind;
  chartData?: Record<string, unknown>[];
  chartLabelField?: string;
  chartValueFields?: string[];

  // Складене з часових зв'язків (set-year/set-month/set-week/set-day —
  // runConnectionActions) значення часового періоду цього показника.
  // Скільки одиниць підключено джерелами — стільки й заповнено (комусь
  // досить року, комусь треба рік+місяць+день). content елемента
  // форматується з цього об'єкта автоматично (formatTimeContext).
  timeContext?: { year?: string; month?: string; week?: string; day?: string };

  // Позначає елемент готовим ЧАСОВИМ ДЖЕРЕЛОМ (панель Параметри → "🕐 Часове
  // джерело"): дає елементу відповідний пікер значення (рік/місяць/тиждень/
  // день замість вільного тексту) і записує вибране в content. Саму по собі
  // дію ні на що не впливає — підключення до цілі й досі робиться вручну
  // через "🔗 Зв'язки" (set-year/set-month/set-week/set-day), це поле лише
  // спрощує СТВОРЕННЯ такого джерела.
  timeSourceUnit?: "year" | "month" | "week" | "day";

  // Динамічне поле-РІК бейджа (runConnectionActions): спочатку саме займає
  // весь бейдж (клік по джерелу-року). Коли до ЦЬОГО Ж поля підключають
  // джерело-місяць/тиждень/день, воно НЕ дописується в сам текст року —
  // натомість поле року стискається й підіймається вгору, а під ним
  // автоматично створюється (один раз) чи оновлюється рядок дати
  // (badgeDateSubId) з місяцем (+днем в тому самому рядку). Користувачу
  // потрібно підключити зв'язки лише до ЦЬОГО ОДНОГО поля — розкладка на
  // два рядки відбувається сама.
  isBadgeYearField?: boolean;
  badgeDateSubId?: number;
  // Позначає сам авто-створений рядок дати — щоб той самий стиль (складання
  // одиниць + ВЕЛИКІ літери) застосовувався, навіть якщо зв'язок підключили
  // напряму до цього рядка, а не до поля-року (яке його й створило).
  isBadgeDateSubField?: boolean;

  // Той самий принцип, що й excludeFromCascade (каскад видимості) — розриває
  // каскад УСПАДКУВАННЯ ЗВ'ЯЗКІВ від предків саме на цьому елементі: він і
  // все вкладене в нього більше не успадковують зв'язки, підключені до
  // елементів вище (runConnectionActions). Власні зв'язки, підключені прямо
  // до цього елемента, і далі працюють як завжди.
  excludeFromConnectionCascade?: boolean;
}

// Тіло елемента "📈 Графік" (Recharts) — окремий компонент, не inline у
// renderCanvasNode: 5 типів мають несумісні структури даних (секторна й
// точкова — особливий випадок, не звичайний список серій), тож простіше
// розводити раннім return, ніж однією великою умовною JSX-гілкою.
// chartLabelField для "Точкова" — це числове поле X (не текстова мітка,
// як у решти 4 типів) — той самий слот, різне призначення за chartKind.
function ChartBody({ el }: { el: CanvasElement }) {
  const data = el.chartData ?? [];
  const labelField = el.chartLabelField ?? "__label";
  const valueFields = el.chartValueFields ?? [];

  if (data.length === 0 || valueFields.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-center text-[11px] text-slate-400 border border-dashed border-slate-300 p-2">
        Немає даних для графіка
      </div>
    );
  }

  if (el.chartKind === "pie") {
    const field = valueFields[0];
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={field}
            nameKey={labelField}
            outerRadius="80%"
            label={(props: { name?: string | number }) => String(props.name ?? "")}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (el.chartKind === "scatter") {
    const yField = valueFields[0];
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={labelField} type="number" name={labelField} tick={{ fontSize: 10 }} />
          <YAxis dataKey={yField} type="number" name={yField} tick={{ fontSize: 10 }} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={data} fill={CHART_PALETTE[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  const axis = (
    <>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey={labelField} tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={40} />
      <YAxis tick={{ fontSize: 10 }} />
      <Tooltip />
      {valueFields.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
    </>
  );

  if (el.chartKind === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          {axis}
          {valueFields.map((field, i) => (
            <Line key={field} type="monotone" dataKey={field} stroke={CHART_PALETTE[i % CHART_PALETTE.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (el.chartKind === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          {axis}
          {valueFields.map((field, i) => (
            <Area
              key={field}
              type="monotone"
              dataKey={field}
              stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
              fill={CHART_PALETTE[i % CHART_PALETTE.length]}
              fillOpacity={0.3}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        {axis}
        {valueFields.map((field, i) => (
          <Bar key={field} dataKey={field} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Зв'язок між двома елементами полотна — окрема сутність (як Page), не поле
// елемента, бо стосується одразу ДВОХ. Створюється інтерактивно в режимі
// "🔗 Зв'язки" (клік по елементу-джерелу, потім по елементу-цілі — між ними
// з'являється лінія зі стрілкою). actions — МАСИВ функцій, які виконує клік
// на джерелі (напр. одночасно "показати ціль" і "задає МІСЯЦЬ цілі") —
// один зв'язок (одна лінія) може нести кілька дій одразу, не лише одну.
interface ElementConnection {
  id: string;
  fromId: number;
  toId: number;
  actions?: string[];
}

interface Page {
  id: string;
  name: string;
  meshBackground?: boolean; // анімований mesh-фон замість звичайного білого полотна
  meshSpeed?: number;
  meshIntensity?: number;
  meshColors?: string[];
}

// Дефолтна тепла палітра mesh-фону Хотина (ті самі 5 кольорів, що й фолбеки
// в globals.css/HTML-експорті), просто без альфи — для color-піддерів у панелі.
const DEFAULT_MESH_COLORS = ["#d69696", "#96beb4", "#c8b4d2", "#b4c8cd", "#e6c8b9"];

// "Складні об'єкти" — готові пресети кнопок із власним дизайном/поведінкою
// (підсвітка, кольори станів, анімація через CSS transition вже вбудована в
// саму кнопку), які можна донастроїти в окремій панелі перед тим, як додати
// на полотно. Перший пресет — 1:1 перенесення .ypill з hospital-analytics
// (public/shared/layout.css + utils.js:renderHeaderBlock): кругла кнопка з
// груповою ексклюзивністю (лише одна активна серед сестер у блоці).
interface ComplexObjectField {
  key: keyof CanvasElement;
  label: string;
  type: "color" | "number";
}
// Дочірній елемент, вкладений у батька цього пресету (напр. число й підпис
// картки КПІ, вкладені в її прямокутник) — власні позиція/розмір відносно
// батька й власні стилі (fontSize/textColor/textAlign тощо).
interface ComplexObjectChildSpec {
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  defaults: Partial<CanvasElement>;
}
interface ComplexObjectTemplate {
  id: string;
  label: string;
  description: string;
  defaults: Partial<CanvasElement>;
  fields: ComplexObjectField[];
  // Якщо задано — цей пресет створює одразу ГРУПУ кнопок (по одній на кожен
  // рядок тут), а не одну кнопку: кожен елемент отримує однаковий стиль
  // (template.defaults + чернетка), свій текст із groupItems[i] і власну
  // ширину під довжину цього тексту (як .ypill-month у hospital-analytics —
  // авто-ширина замість фіксованих 60px в .ypill).
  groupItems?: string[];
  // Якщо задано — крім самого елемента (батька) одразу створюються й ці
  // дочірні елементи з parentId, виставленим на щойно створений батьківський
  // id (напр. число + підпис усередині картки КПІ).
  children?: ComplexObjectChildSpec[];
}

// Повні назви місяців (називний відмінок, ВЕЛИКИМИ) — 1:1 з MONTH_PILL_NAMES
// у public/js/utils.js (пігулки місяців під роками в hospital-analytics).
const MONTH_PILL_LABELS = [
  "СІЧЕНЬ", "ЛЮТИЙ", "БЕРЕЗЕНЬ", "КВІТЕНЬ", "ТРАВЕНЬ", "ЧЕРВЕНЬ",
  "ЛИПЕНЬ", "СЕРПЕНЬ", "ВЕРЕСЕНЬ", "ЖОВТЕНЬ", "ЛИСТОПАД", "ГРУДЕНЬ",
];

// Дні тижня (називний відмінок) — 1:1 з dayNames/clockWeekdays у
// hospital-analytics (head-cabinet.html/doctor-cabinet.html), той самий
// порядок від неділі (як JS Date.getDay(): 0 = неділя).
const WEEKDAY_LABELS = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "Пʼятниця", "Субота"];

// Ендпоінти "живих" показників, доступних для прив'язки до "📊 Картки КПІ"
// (панель "🔗 Показник → картка" у відповідних формах кубів). Свідомо лише
// ці 4: демографія має додаткову розбивку (стать×вік), яку зараз нічим
// зафіксувати, а часові патерни/нічні/вихідні чергування — період у них
// категорія доби/дня тижня, а не дата, не сумісно з моделлю
// "показник + дата-об'єкт".
const LIVE_INDICATOR_ENDPOINTS: Record<NonNullable<CanvasElement["liveBinding"]>["source"], string> = {
  hierarchy: "/api/indicators/hierarchy",
  "doctor-hierarchy": "/api/indicators/doctor-hierarchy",
  readmissions: "/api/indicators/readmissions",
  diagnoses: "/api/indicators/diagnoses",
};

// Складає grain + очікуваний period_label з timeContext підключених часових
// джерел — 1:1 з тим, що реально повертають lpz_*_cube RPC (перевірено
// живими запитами): РІК → grain=year, "2026"; +МІСЯЦЬ → grain=month,
// "2026-03"; +ДЕНЬ → grain=day, "2026-03-15". Без року — резолвити нема як
// (RPC не приймає рік окремим фільтром, лише повертає всю серію на обраній
// гранулярності). "Тиждень" (день тижня) свідомо не бере участі: у RPC
// grain=week — реальний ISO-тиждень, не назва дня тижня, це різні поняття.
const buildPeriodKey = (ctx: NonNullable<CanvasElement["timeContext"]>): { grain: string; label: string } | null => {
  const year = ctx.year?.trim();
  if (!year) return null;
  if (!ctx.month) return { grain: "year", label: year };
  const monthIdx = MONTH_PILL_LABELS.indexOf(ctx.month);
  if (monthIdx === -1) return null;
  const month = String(monthIdx + 1).padStart(2, "0");
  if (!ctx.day) return { grain: "month", label: `${year}-${month}` };
  const day = String(Number(ctx.day)).padStart(2, "0");
  return { grain: "day", label: `${year}-${month}-${day}` };
};

// Доступні функції зв'язку (панель "🔗 Зв'язки") — чекбокси, не dropdown:
// один зв'язок (одна лінія на полотні) може нести КІЛЬКА функцій одразу.
const CONNECTION_ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "show", label: "👁️ Клік на джерелі показує ціль" },
  { value: "hide", label: "🙈 Клік на джерелі ховає ціль" },
  { value: "toggle", label: "🔁 Клік на джерелі перемикає видимість цілі" },
  { value: "filter", label: "🔍 Клік на джерелі фільтрує список-ціль (лишає лише рядки з тим самим linkKey, що й джерело)" },
  { value: "set-year", label: "📅 Клік на джерелі задає РІК цілі" },
  { value: "set-month", label: "📅 Клік на джерелі задає МІСЯЦЬ цілі" },
  { value: "set-week", label: "📅 Клік на джерелі задає ДЕНЬ ТИЖНЯ цілі" },
  { value: "set-day", label: "📅 Клік на джерелі задає ДЕНЬ цілі" },
  { value: "set-icd", label: "🩻 Клік на джерелі задає МКХ-10 цілі (діагностичний вузол)" },
  { value: "set-doctor", label: "👨‍⚕️ Клік на джерелі задає ЛІКАРЯ цілі (лікарський вузол)" },
];

// "Універсальний вузол" картки КПІ (liveBinding) приймає не лише часові
// джерела (set-year/month/week/day → timeContext), а й параметричні —
// set-icd/set-doctor записують РІВНО один параметр у liveBinding.params
// (новий клік ПЕРЕЗАПИСУЄ попередній, без накопичення, на відміну від
// часових одиниць). Готові джерела для них уже існують на полотні як
// побічний продукт звичайних кубів — не треба нічого окремо позначати:
// - "Лікарський вузол" — БУДЬ-ЯКИЙ рядок списку "🩺 Ординаторська"
//   (linkKey = lpz_empl.resource_id — той самий id, що приймає
//   lpz_doctor_indicator_cube.p_doctor_id як lpz_hospitalization_doctors.doctor_id).
// - "Діагностичний вузол" — БУДЬ-ЯКИЙ рядок списку "🩻 Показники по
//   діагнозу", завантаженого БЕЗ фільтра МКХ-10 (тоді кожен рядок — окремий
//   діагноз, а його content — сам код, "icd_primary" переданий як labelField
//   в addCubeRowsToCanvas).
const PARAM_ACTION_KEY: Record<string, string> = {
  "set-icd": "icd",
  "set-doctor": "doctorId",
};

// Стиль спільний для одиночної пігулки й блоку пігулок-місяців — той самий
// .ypill з hospital-analytics (форма/кольори/стани), щоб обидва пресети
// лишались візуально ідентичними, навіть якщо один з них зміниться.
const PILL_STYLE_DEFAULTS: Partial<CanvasElement> = {
  type: "button",
  borderRadius: 14,
  isToggle: true,
  groupExclusive: true,
  customBgColor: "#ffffff",
  textColor: "#3a3a3a",
  hoverBgColor: "#f3d9df",
  hoverTextColor: "#3a3a3a",
  activeBgColor: "#3a3a3a",
  activeTextColor: "#ffffff",
  glowColor: "#b27c8b",
  glowBlur: 0,
  fontSize: 13,
  fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
};

const PILL_STYLE_FIELDS: ComplexObjectField[] = [
  { key: "customBgColor", label: "Фон", type: "color" },
  { key: "textColor", label: "Текст", type: "color" },
  { key: "hoverBgColor", label: "Фон (наведення)", type: "color" },
  { key: "hoverTextColor", label: "Текст (наведення)", type: "color" },
  { key: "activeBgColor", label: "Фон (активна)", type: "color" },
  { key: "activeTextColor", label: "Текст (активна)", type: "color" },
  { key: "glowColor", label: "Підсвітка (колір)", type: "color" },
  { key: "glowBlur", label: "Підсвітка (розмиття px)", type: "number" },
  { key: "borderRadius", label: "Скруглення (px)", type: "number" },
];

// Поля відповіді public.lpz_hospital_summary → плитки "КПІ лікарні" (див.
// handleLoadHospitalKpi/handleKpiPillClick): кожному текстовому полю значення
// плитки присвоюється kpiField з цього списку, щоб пігулка-рік знала, яке
// саме число туди підставити після живого запиту.
const HOSPITAL_KPI_FIELDS: { field: NonNullable<CanvasElement["kpiField"]>; label: string }[] = [
  { field: "total_cases", label: "ВИПАДКІВ" },
  { field: "unique_patients", label: "ПАЦІЄНТІВ" },
  { field: "deaths", label: "СМЕРТЕЙ" },
  { field: "death_rate_pct", label: "ЛЕТАЛЬНІСТЬ" },
  { field: "avg_age", label: "СЕРЕДНІЙ ВІК" },
  { field: "avg_bed_days", label: "СЕР. ЛІЖКО-ДНІВ" },
];

const COMPLEX_OBJECTS: ComplexObjectTemplate[] = [
  {
    id: "pill",
    label: "🔘 Пігулка (Pill)",
    description:
      "Кругла кнопка-перемикач як фільтр років у старому проекті — заокруглена форма, підсвітка при наведенні, заливка при активності, групова ексклюзивність (лише одна активна серед сестер у блоці).",
    defaults: {
      ...PILL_STYLE_DEFAULTS,
      content: "Пігулка",
      width: 60,
      height: 30,
    },
    fields: [
      ...PILL_STYLE_FIELDS,
      { key: "width", label: "Ширина (px)", type: "number" },
      { key: "height", label: "Висота (px)", type: "number" },
    ],
  },
  {
    id: "pillMonths",
    label: "🔘 Блок пігулок (місяці)",
    description:
      "Одразу 12 пігулок з назвами місяців (СІЧЕНЬ…ГРУДЕНЬ) у ТОЧНО тому ж стилі, що й пігулка вище — форма, кольори, підсвітка й групова ексклюзивність (активний лише один місяць одночасно). Ширина кожної пігулки підлаштовується під довжину назви, як пігулки місяців у старому проекті.",
    defaults: {
      ...PILL_STYLE_DEFAULTS,
      height: 30,
    },
    fields: [...PILL_STYLE_FIELDS, { key: "height", label: "Висота (px)", type: "number" }],
    groupItems: MONTH_PILL_LABELS,
  },
  {
    id: "kpiCard",
    label: "📊 Картка КПІ",
    description:
      "1:1 з .kpi-row у khotyn_slide.html (старий проект) — число (36px, ITFLight 300, #1a1a1a) над підписом (20px, ITFLight 300, #9a958f, ВЕЛИКИМИ), обидва притиснуті вправо. Батько — прозора рамка; число й підпис — 2 ПОСТІЙНІ посадочні місця (окремі вкладені текстові елементи, кожне зі своїм фіксованим призначенням — зверху завжди число, знизу завжди підпис). Картка додається ПОРОЖНЬОЮ: виділи число чи підпис і в панелі «📡 Живі показники» підключи до потрібного показника (заповнює підпис і фіксує запит), а до самої картки підклюси часове джерело («🔗 Зв'язки») — число з'явиться лише тоді.",
    defaults: {
      type: "block",
      content: "",
      width: 200,
      height: 70,
      customBgColor: "#ffffff",
      bgOpacity: 0,
      textColor: "#1a1a1a",
      padding: 0,
      borderRadius: 0,
      fontSize: 12,
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
      fontWeight: "300",
      textAlign: "right",
    },
    fields: [
      { key: "width", label: "Ширина (px)", type: "number" },
      { key: "height", label: "Висота (px)", type: "number" },
    ],
    children: [
      {
        content: "—",
        x: 0,
        y: 0,
        width: 200,
        height: 44,
        defaults: {
          type: "text",
          fontSize: 36,
          fontWeight: "300",
          textColor: "#1a1a1a",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
          isKpiNumberSlot: true,
        },
      },
      {
        content: "ПОКАЗНИК",
        x: 0,
        y: 44,
        width: 200,
        height: 26,
        defaults: {
          type: "text",
          fontSize: 20,
          fontWeight: "300",
          textColor: "#9a958f",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
          isKpiLabelSlot: true,
        },
      },
    ],
  },
  {
    id: "yearBadge",
    label: "🏷️ Бейдж року",
    description:
      "Наближення до .year-badge з hospital-analytics (public/shared/layout.css) — велике число року над назвою місяця, обидва по центру. Оригінал малює число градієнтом (accent-berry → sage) через background-clip:text — модель елементів цього не підтримує, тож узято суцільний accent-berry (#9c5468) як найближчий орієнтир.",
    defaults: {
      type: "block",
      content: "",
      width: 147,
      height: 80,
      customBgColor: "#ffffff",
      bgOpacity: 0,
      padding: 0,
      borderRadius: 0,
    },
    fields: [
      { key: "width", label: "Ширина (px)", type: "number" },
      { key: "height", label: "Висота (px)", type: "number" },
    ],
    children: [
      {
        content: "2026",
        x: 0,
        y: 0,
        width: 147,
        height: 54,
        defaults: {
          type: "text",
          fontSize: 48,
          fontWeight: "300",
          textColor: "#9c5468",
          textAlign: "center",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "СІЧЕНЬ",
        x: 0,
        y: 54,
        width: 147,
        height: 26,
        defaults: {
          type: "text",
          fontSize: 15,
          fontWeight: "300",
          textColor: "#9c5468",
          textAlign: "center",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
    ],
  },
  {
    id: "emptyTimeBadge",
    label: "🏷️ Бейдж (порожній, для часових джерел)",
    description:
      "Той самий стиль і розміри, що й 'Бейдж року', але одне порожнє поле — розумний бейдж. Підключіть джерело-рік (панель '🔗 Зв'язки', дія 'задає РІК цілі') до ЦЬОГО поля — рік займе весь бейдж. Підключіть туди ж (до ТОГО САМОГО поля) джерело-місяць — рік сам стиснеться й підійметься вгору, а під ним автоматично з'явиться рядок з місяцем; підключений так само день — до того самого поля — стане в той-таки рядок поруч із місяцем («Березень · 15»). Усі підключення йдуть до ОДНОГО поля, розкладку на два рядки система робить сама.",
    defaults: {
      type: "block",
      content: "",
      width: 147,
      height: 80,
      customBgColor: "#ffffff",
      bgOpacity: 0,
      padding: 0,
      borderRadius: 0,
    },
    fields: [
      { key: "width", label: "Ширина (px)", type: "number" },
      { key: "height", label: "Висота (px)", type: "number" },
    ],
    children: [
      {
        content: "",
        x: 0,
        y: 0,
        width: 147,
        height: 80,
        defaults: {
          type: "text",
          fontSize: 64,
          fontWeight: "300",
          textColor: "#9c5468",
          textAlign: "center",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
          isBadgeYearField: true,
        },
      },
    ],
  },
  {
    id: "deptCard",
    label: "🏢 Картка відділення",
    description:
      "Наближення до .dept-expand/.de-* з hospital-analytics — назва відділення й завідувач над рядком статистики (3 колонки: значення + підпис), усе притиснуте вправо. Роздільні лінії між колонками (border-left в оригіналі) модель елементів не підтримує — колонки розділені лише відступом.",
    defaults: {
      type: "block",
      content: "",
      width: 260,
      height: 80,
      customBgColor: "#ffffff",
      bgOpacity: 0,
      padding: 0,
      borderRadius: 0,
    },
    fields: [{ key: "width", label: "Ширина (px)", type: "number" }],
    children: [
      {
        content: "Терапевтичне відділення",
        x: 0,
        y: 0,
        width: 260,
        height: 22,
        defaults: {
          type: "text",
          fontSize: 15,
          fontWeight: "300",
          textColor: "#4a4a4a",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "Зав.: Іваненко О. П.",
        x: 0,
        y: 22,
        width: 260,
        height: 18,
        defaults: {
          type: "text",
          fontSize: 13,
          fontWeight: "300",
          textColor: "#3a3a3a",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "42",
        x: 0,
        y: 46,
        width: 80,
        height: 20,
        defaults: {
          type: "text",
          fontSize: 17,
          fontWeight: "300",
          textColor: "#3a3a3a",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "ШТАТ",
        x: 0,
        y: 66,
        width: 80,
        height: 14,
        defaults: {
          type: "text",
          fontSize: 9,
          fontWeight: "400",
          textColor: "#8a857f",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "12",
        x: 90,
        y: 46,
        width: 80,
        height: 20,
        defaults: {
          type: "text",
          fontSize: 17,
          fontWeight: "300",
          textColor: "#3a3a3a",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "ЛІКАРІ",
        x: 90,
        y: 66,
        width: 80,
        height: 14,
        defaults: {
          type: "text",
          fontSize: 9,
          fontWeight: "400",
          textColor: "#8a857f",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "1 240",
        x: 180,
        y: 46,
        width: 80,
        height: 20,
        defaults: {
          type: "text",
          fontSize: 17,
          fontWeight: "300",
          textColor: "#3a3a3a",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "ГОСПІТАЛІЗАЦІЙ",
        x: 180,
        y: 66,
        width: 80,
        height: 14,
        defaults: {
          type: "text",
          fontSize: 9,
          fontWeight: "400",
          textColor: "#8a857f",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
    ],
  },
  {
    id: "userProfile",
    label: "👤 Профіль користувача",
    description:
      "1:1 з .me-bar/.me-surname/.me-firstname з hospital-analytics — прізвище (19px, ВЕЛИКИМИ) над ім'ям (11px, ВЕЛИКИМИ), обидва притиснуті вправо. У старому проекті заповнюється з /api/me (utils.js:applyMeProfile) — тут це текст-заглушка, готова для перев'язки на реальні дані.",
    defaults: {
      type: "block",
      content: "",
      width: 200,
      height: 42,
      customBgColor: "#ffffff",
      bgOpacity: 0,
      padding: 0,
      borderRadius: 0,
    },
    fields: [{ key: "width", label: "Ширина (px)", type: "number" }],
    children: [
      {
        content: "ІВАНЕНКО",
        x: 0,
        y: 0,
        width: 200,
        height: 24,
        defaults: {
          type: "text",
          fontSize: 19,
          fontWeight: "300",
          textColor: "#3a3a3a",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "ОЛЕНА ПЕТРІВНА",
        x: 0,
        y: 24,
        width: 200,
        height: 18,
        defaults: {
          type: "text",
          fontSize: 11,
          fontWeight: "300",
          textColor: "#3a3a3a",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
    ],
  },
  {
    id: "logoutButton",
    label: "🚪 Кнопка-пігулка «Вийти»",
    description:
      "1:1 з .me-logout з hospital-analytics — кнопка без фону в спокої, з підсвіткою (заливка + світіння) при наведенні. За формою й поведінкою схожа на «Пігулку», але більший шрифт (20px) і без групової ексклюзивності — це звичайна кнопка дії, а не перемикач-фільтр.",
    defaults: {
      type: "button",
      content: "Вийти",
      width: 110,
      height: 40,
      customBgColor: "#ffffff",
      bgOpacity: 0,
      textColor: "#4a4a4a",
      hoverBgColor: "#3a3a3a",
      hoverTextColor: "#ffffff",
      glowColor: "#3a3a3a",
      glowBlur: 14,
      borderRadius: 16,
      fontSize: 20,
      fontWeight: "300",
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
    },
    fields: [
      { key: "customBgColor", label: "Фон", type: "color" },
      { key: "textColor", label: "Текст", type: "color" },
      { key: "hoverBgColor", label: "Фон (наведення)", type: "color" },
      { key: "hoverTextColor", label: "Текст (наведення)", type: "color" },
      { key: "glowColor", label: "Підсвітка (колір)", type: "color" },
      { key: "glowBlur", label: "Підсвітка (розмиття px)", type: "number" },
      { key: "borderRadius", label: "Скруглення (px)", type: "number" },
      { key: "width", label: "Ширина (px)", type: "number" },
      { key: "height", label: "Висота (px)", type: "number" },
    ],
  },
  {
    id: "docItem",
    label: "🩺 Рядок лікаря (ординаторська)",
    description:
      "Наближення до .doc-item з hospital-analytics (public/shared/head-cabinet.css, ординаторська на сторінці завідувача) — ім'я над посадою (ВЕЛИКИМИ, дрібніше), обидва праворуч, підсвітка при наведенні. Оригінал світить текст через text-shadow і трохи інакше фарбує обране ім'я при кліку (.doc-active) — модель елементів підтримує лише підсвітку box-shadow навколо всього рядка (як у решти кнопок) і не вміє перефарбувати саме вкладений напис при кліку, тому активний стан не відтворено.",
    defaults: {
      type: "button",
      content: "",
      width: 220,
      height: 46,
      customBgColor: "#ffffff",
      bgOpacity: 0,
      textColor: "#3a3a3a",
      hoverBgColor: "#ffffff",
      hoverTextColor: "#3a3a3a",
      glowColor: "#b27c8b",
      glowBlur: 16,
      borderRadius: 0,
      fontSize: 20,
      fontWeight: "300",
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
    },
    fields: [
      { key: "glowColor", label: "Підсвітка (колір)", type: "color" },
      { key: "glowBlur", label: "Підсвітка (розмиття px)", type: "number" },
      { key: "width", label: "Ширина (px)", type: "number" },
    ],
    children: [
      {
        content: "Прізвище Ім'я",
        x: 0,
        y: 0,
        width: 220,
        height: 28,
        defaults: {
          type: "text",
          fontSize: 20,
          fontWeight: "300",
          textColor: "#3a3a3a",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "ПОСАДА",
        x: 0,
        y: 28,
        width: 220,
        height: 18,
        defaults: {
          type: "text",
          fontSize: 12,
          fontWeight: "400",
          textColor: "#9a958f",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
    ],
  },
  {
    id: "censusRow",
    label: "🏥 Пацієнт у відділенні",
    description:
      "Наближення до .census-row/.census-name/.census-meta/.census-bar/.census-days з hospital-analytics (public/shared/layout.css, розділ «Перебуває у відділенні» на entry.html/doctor-cabinet.html/head-cabinet.html) — ім'я й дані пацієнта зліва, міні-смужка перебування (сегмент = доба) і кількість днів справа. Оригінал підсвічує ім'я синім при наведенні (.census-row:hover) — модель елементів не вміє перефарбувати вкладений текст за наведенням на батька, тому це не відтворено; смужка тут — фіксовані 4 сегменти для вигляду, а не реальна кількість діб.",
    defaults: {
      type: "block",
      content: "",
      width: 340,
      height: 30,
      customBgColor: "#ffffff",
      bgOpacity: 0,
      padding: 0,
      borderRadius: 0,
    },
    fields: [{ key: "width", label: "Ширина (px)", type: "number" }],
    children: [
      {
        content: "Прізвище Ім'я",
        x: 0,
        y: 2,
        width: 130,
        height: 20,
        defaults: {
          type: "text",
          fontSize: 17,
          fontWeight: "300",
          textColor: "#3a3a3a",
          textAlign: "left",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "42р · Пневмонія",
        x: 135,
        y: 2,
        width: 120,
        height: 20,
        defaults: {
          type: "text",
          fontSize: 14,
          fontWeight: "300",
          textColor: "#9a958f",
          textAlign: "left",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
      {
        content: "",
        x: 258,
        y: 9,
        width: 6,
        height: 14,
        defaults: { type: "block", customBgColor: "#b27c8b", bgOpacity: 1, borderRadius: 1, padding: 0 },
      },
      {
        content: "",
        x: 266,
        y: 9,
        width: 6,
        height: 14,
        defaults: { type: "block", customBgColor: "#b27c8b", bgOpacity: 1, borderRadius: 1, padding: 0 },
      },
      {
        content: "",
        x: 274,
        y: 9,
        width: 6,
        height: 14,
        defaults: { type: "block", customBgColor: "#b27c8b", bgOpacity: 1, borderRadius: 1, padding: 0 },
      },
      {
        content: "",
        x: 282,
        y: 9,
        width: 6,
        height: 14,
        defaults: { type: "block", customBgColor: "#000000", bgOpacity: 1, borderRadius: 1, padding: 0 },
      },
      {
        content: "4 дні",
        x: 294,
        y: 4,
        width: 46,
        height: 18,
        defaults: {
          type: "text",
          fontSize: 14,
          fontWeight: "300",
          textColor: "#b27c8b",
          textAlign: "right",
          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
          bgOpacity: 0,
          padding: 0,
        },
      },
    ],
  },
];

// "Бібліотека" — окрема панель, де користувач сам зберігає вибраний
// фрагмент полотна (один елемент чи кілька, з піддеревами) як готовий блок,
// щоб потім одним кліком вставляти його повторно на цій чи інших сторінках.
// На відміну від COMPLEX_OBJECTS (вбудовані пресети з фіксованим дизайном
// і власними полями налаштувань), вміст цієї бібліотеки повністю визначає
// сам користувач — вона порожня, доки щось не збережуть.
interface LibraryItem {
  id: string;
  name: string;
  // Оригінальні елементи вибраного фрагмента (корені + всі нащадки,
  // preorder — предок завжди йде перед своїми нащадками) зі своїми
  // "рідними" id/parentId. Ці id використовуються лише як внутрішні
  // посилання для перезв'язки при вставці (handleAddLibraryItem) — самі
  // елементи на полотні не з'являються, доки пункт не додадуть.
  elements: CanvasElement[];
  rootIds: number[];
  // Зв'язки, де і джерело, і ціль — ОБИДВА всередині цього фрагмента
  // (зв'язки назовні фрагмента не мають сенсу зберігати — ціль поза
  // виділенням не копіюється разом з ним). При вставці (handleAddLibraryItem)
  // fromId/toId перезв'язуються на клоновані id так само, як parentId.
  connections?: ElementConnection[];
}

// Користувацькі "складні об'єкти" — та сама механіка, що й LibraryItem
// (виділений фрагмент простих елементів → повторно вставний блок), лише
// зберігаються окремим списком у панелі "Складні об'єкти", поруч із
// вбудованими пресетами COMPLEX_OBJECTS: це спосіб зібрати новий складний
// об'єкт із простих фігур (прямокутник, текст тощо) прямо на полотні.
interface CustomComplexObject {
  id: string;
  name: string;
  elements: CanvasElement[];
  rootIds: number[];
}

const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Живий (React) mesh-шар — використовується і для фону сторінки (в <main>), і
// для фону окремого блоку (в renderCanvasNode). speed: множник швидкості
// (1 = оригінальні 18с/26с), intensity: 0..100 (загальна непрозорість шару),
// colors: 1-5 кастомних кольорів замість дефолтної палітри.
// zIndex: не задаємо явно для фону сторінки (тоді працює як і в оригінальному
// класі — z-index:0, стек визначається порядком у DOM) — і задаємо -1 для
// фону окремого блоку, де поряд є нестатично не позиційований контент
// (текст кнопки/заголовка), який інакше опинився б під mesh-шаром.
const renderMeshLayer = (speed?: number, intensity?: number, colors?: string[], zIndex?: number) => {
  const spd = speed ?? 1;
  const opacity = (intensity ?? 100) / 100;
  const meshVars: Record<string, string> = {};
  (colors ?? []).forEach((c, i) => {
    if (i < 5) meshVars[`--mesh-${i + 1}`] = hexToRgba(c, 0.4);
  });

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ ...meshVars, opacity, ...(zIndex !== undefined ? { zIndex } : {}) } as React.CSSProperties}
    >
      <div className="ctor-mesh-bg" style={{ animationDuration: `${18 / spd}s` }} />
      <div className="ctor-mesh-bg2" style={{ animationDuration: `${26 / spd}s` }} />
    </div>
  );
};

// Той самий mesh-шар, але як HTML-рядок — для статичного експорту.
const renderMeshLayerHTML = (speed?: number, intensity?: number, colors?: string[], zIndex?: number): string => {
  const spd = speed ?? 1;
  const opacity = (intensity ?? 100) / 100;
  const meshVarsCSS = (colors ?? [])
    .slice(0, 5)
    .map((c, i) => `--mesh-${i + 1}:${hexToRgba(c, 0.4)};`)
    .join("");

  return `
    <div style="position:absolute;inset:0;overflow:hidden;pointer-events:none;opacity:${opacity};${zIndex !== undefined ? `z-index:${zIndex};` : ""}${meshVarsCSS}">
      <div class="ctor-mesh-bg" style="animation-duration:${18 / spd}s;"></div>
      <div class="ctor-mesh-bg2" style="animation-duration:${26 / spd}s;"></div>
    </div>
  `;
};

// Згорнута/розгорнута кольорова секція всередині вкладки "Параметри" —
// оголошена ОКРЕМО від AppBoundedCanvas (не інлайн-компонент у рендері),
// щоб її ідентичність лишалась стабільною між рендерами: якби вона
// створювалась заново на кожен рендер батька, React перемонтовував би її
// (і всі контрольовані input-и в children) при кожному натисканні клавіші,
// скидаючи фокус. Сама секція без внутрішнього стану — isOpen/onToggle
// підняті в AppBoundedCanvas (openParamSections/toggleParamSection).
function ParamSection({
  label,
  isOpen,
  onToggle,
  colorClass,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  colorClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`border rounded-lg overflow-hidden ${colorClass}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold uppercase text-left"
      >
        <span>{label}</span>
        <span className="text-[10px] shrink-0 opacity-70">{isOpen ? "▼" : "▶"}</span>
      </button>
      {isOpen && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

// Будує clip-path (SVG path, fill-rule evenodd) для форми "рамки": ЗОВНІШНІЙ
// контур — завжди гострий прямокутник (справжня форма самого об'єкта, без
// округлення), ВНУТРІШНІЙ контур (де рамка переходить у "вікно" до об'єкта)
// — заокруглений на radius px. Два контури одного напрямку обходу +
// evenodd лишають видимою лише різницю між ними (саме кільце завтовшки
// thickness), тому border-radius CSS тут не годиться — він завжди округляє
// ОБИДВА краї синхронно (внутрішній лише як зовнішній мінус товщина), а нам
// потрібні незалежні радіуси з різних боків.
function frameClipPath(width: number, height: number, thickness: number, radius: number): string {
  const t = Math.max(0, thickness);
  const innerW = Math.max(0, width - t * 2);
  const innerH = Math.max(0, height - t * 2);
  const r = Math.max(0, Math.min(radius, innerW / 2, innerH / 2));
  const ix = t;
  const iy = t;

  const outer = `M0,0 L${width},0 L${width},${height} L0,${height} Z`;
  const inner =
    r > 0
      ? `M${ix + r},${iy} L${ix + innerW - r},${iy} A${r},${r} 0 0 1 ${ix + innerW},${iy + r} L${ix + innerW},${iy + innerH - r} A${r},${r} 0 0 1 ${ix + innerW - r},${iy + innerH} L${ix + r},${iy + innerH} A${r},${r} 0 0 1 ${ix},${iy + innerH - r} L${ix},${iy + r} A${r},${r} 0 0 1 ${ix + r},${iy} Z`
      : `M${ix},${iy} L${ix + innerW},${iy} L${ix + innerW},${iy + innerH} L${ix},${iy + innerH} Z`;

  return `path(evenodd, "${outer} ${inner}")`;
}

// Розбирає колір рамки (hex від getElementColor або "rgba(r, g, b, a)" від
// applyBgOpacity) на числові канали, щоб можна було сконструювати з нього
// градієнт прозорості з тим самим кольором, але власною альфою на кожному
// стопі.
function parseFrameColor(color: string): [number, number, number, number] {
  if (color.startsWith("#")) {
    const hex = color.length === 4
      ? color.slice(1).split("").map((c) => c + c).join("")
      : color.slice(1);
    const bigint = parseInt(hex, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255, 1];
  }
  const nums = color.replace(/rgba?\(|\)/g, "").split(",").map((s) => parseFloat(s.trim()));
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, nums[3] ?? 1];
}

// Нормалізована крива згасання прозорості: f=0 (зовнішній край рамки) -> 1
// (повний колір поля), f=1 (внутрішній контур, де рамка межує з об'єктом) ->
// 0 (повна прозорість). При steepness→0 формула вироджується в звичайний
// лінійний перехід (1-f) — це границя виразу, тож окремого "лінійного
// режиму" не потрібно. Більший steepness — колір спадає різко одразу біля
// зовнішнього краю і довгим ледь помітним хвостом тягнеться до внутрішнього.
function expFadeOpacity(f: number, steepness: number): number {
  const k = Math.max(0, steepness);
  if (k < 0.0001) return 1 - f;
  return (Math.exp(-k * f) - Math.exp(-k)) / (1 - Math.exp(-k));
}

// Один "прохід" градієнта по осі: колір поля на 0%, що спадає по експоненті
// в прозорість на frac*100% (frac — частка thickness від повної сторони), і
// дзеркально — з прозорості назад у колір поля між (100-frac*100)% і 100%.
// Середина (від frac*100% до (100-frac*100)%) лишається повністю прозорою —
// там видно сам об'єкт як є, і саме цю зону однаково вирізає внутрішній
// (заокруглений) контур frameClipPath.
function frameAxisGradient(
  direction: string,
  rgb: [number, number, number],
  alpha: number,
  frac: number,
  steepness: number
): string {
  const steps = 14;
  const colorAt = (a: number) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a.toFixed(3)})`;
  const stops: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    stops.push(`${colorAt(expFadeOpacity(f, steepness) * alpha)} ${(f * frac * 100).toFixed(3)}%`);
  }
  for (let i = steps; i >= 0; i--) {
    const f = i / steps;
    stops.push(`${colorAt(expFadeOpacity(f, steepness) * alpha)} ${(100 - f * frac * 100).toFixed(3)}%`);
  }
  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}

// Двовісний (горизонтальний + вертикальний, накладені один на одного як два
// шари background) градієнт прозорості кольору поля навколо рамки. Дає той
// самий ефект "рамка кольору поля", але замість різкого внутрішнього краю —
// плавне згасання в прозорість по експоненті на глибину thickness px.
function frameFadeBackground(color: string, width: number, height: number, thickness: number, steepness: number): string {
  const [r, g, b, a] = parseFrameColor(color);
  const rgb: [number, number, number] = [r, g, b];
  const fracW = Math.min(thickness / Math.max(width, 1), 0.5);
  const fracH = Math.min(thickness / Math.max(height, 1), 0.5);
  return [
    frameAxisGradient("to right", rgb, a, fracW, steepness),
    frameAxisGradient("to bottom", rgb, a, fracH, steepness),
  ].join(", ");
}

// Обгортка для ОДНОГО вкладеного об'єкта (не для батька!) — знає лише
// "яка в мене товщина", "яка крутизна згасання", "який колір навколо мене
// (фон батьківського поля)" і власні width/height. Рамка кольору поля,
// товщиною thickness px, накладена НА САМ об'єкт: зовнішні thickness px
// самого об'єкта перефарбовуються в колір поля й плавно (по експоненті)
// згасають у прозорість до внутрішнього (заокругленого за formою поля)
// контуру. Градієнти не "розтікаються" за межі власного шару (на відміну
// від filter: blur()), тож окремого overflow:hidden-контейнера для
// обрізання зовнішнього краю більше не потрібно.
function ObjectFrame({
  thickness,
  color,
  radius,
  width,
  height,
  fade,
}: {
  thickness: number;
  color: string;
  radius: number;
  width: number;
  height: number;
  fade: number;
}) {
  if (thickness <= 0) return null;
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: frameFadeBackground(color, width, height, thickness, fade),
        clipPath: frameClipPath(width, height, thickness, radius),
        // Дочірні елементи рендеряться через власний <Rnd> з явним
        // zIndex 10 (40 якщо виділені) — позитивний z-index завжди
        // малюється ПОВЕРХ будь-якого сусіда з auto/0 (яким без цього був
        // би цей шар), незалежно від порядку в DOM. Тож якщо дитина лежить
        // під самою рамкою (в межах її товщини), без явного zIndex тут
        // дитина перекривала б рамку, а не навпаки. 45 — вище за
        // максимальний zIndex дитини (40).
        zIndex: 45,
      }}
    />
  );
}

export default function AppBoundedCanvas() {
  const [pages, setPages] = useState<Page[]>([
    { id: "home", name: "Головна" },
    { id: "page-2", name: "Контакти" },
  ]);
  const [currentPageId, setCurrentPageId] = useState<string>("home");

  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Живий час для елементів "Годинник" — тікає раз на секунду, доки на
  // сторінці є хоч один такий елемент; null до монтування (без розбіжності
  // серверного/клієнтського рендеру).
  const [clockNow, setClockNow] = useState<Date | null>(null);
  useEffect(() => {
    setClockNow(new Date());
    const timer = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [hoveredElementId, setHoveredElementId] = useState<number | null>(null);
  const [clickedElementId, setClickedElementId] = useState<number | null>(null);

  // Крос-підсвітка рядків з однаковим linkKey (пацієнт ↔ лікар тощо) — див.
  // коментар біля CanvasElement.linkKey. Клік на рядку з linkKey перезаписує
  // цей набір id-шників усіх ІНШИХ рядків з тим самим ключем на поточній
  // сторінці; ефект нижче прокручує до першого знайденого.
  const [linkedHighlightIds, setLinkedHighlightIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (linkedHighlightIds.size === 0) return;
    const firstId = Array.from(linkedHighlightIds)[0];
    const node = document.querySelector(`[data-el-id="${firstId}"]`);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [linkedHighlightIds]);

  const [newType, setNewType] = useState<ElementType>("block");
  const [newContent, setNewContent] = useState<string>("Елемент");
  const [newCount, setNewCount] = useState<number>(1);
  const [forcedParentId, setForcedParentId] = useState<number | null>(null);

  // СТАНТИ: Сітка (Grid Snap) та Історія (Undo/Redo)
  const [enableGrid, setEnableGrid] = useState<boolean>(true);
  const [history, setHistory] = useState<{ pages: Page[]; elements: CanvasElement[]; connections: ElementConnection[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Позиція та розмір плаваючої панелі "🧱 Інструменти" (Створити/Сторінка/
  // Параметри/Складні об'єкти/Бібліотека — усе, що додає/редагує вміст
  // полотна, об'єднане в одну панель із вкладками замість окремих вікон).
  const [panelPos, setPanelPos] = useState<{ x: number; y: number }>({ x: 24, y: 24 });
  const [panelSize, setPanelSize] = useState<{ width: number; height: number }>({ width: 340, height: 640 });
  const [panelOpacity, setPanelOpacity] = useState<number>(0.8);
  const [toolsPanelCollapsed, setToolsPanelCollapsed] = useState<boolean>(false);

  // Плаваюча панель "📖 Довідники" — Показники й Підключення до бази, обидві
  // суто довідкові (не додають нічого на полотно), об'єднані вкладками в
  // одну панель так само, як і "Інструменти" вище.
  const [refsPanelPos, setRefsPanelPos] = useState<{ x: number; y: number }>({ x: 380, y: 24 });
  const [refsPanelSize, setRefsPanelSize] = useState<{ width: number; height: number }>({ width: 340, height: 560 });
  const [refsPanelOpacity, setRefsPanelOpacity] = useState<number>(0.92);
  const [refsPanelCollapsed, setRefsPanelCollapsed] = useState<boolean>(false);
  const [refsActiveTab, setRefsActiveTab] = useState<"indicators" | "connections">("indicators");

  // Список пресетів "Складних об'єктів" (пігулка тощо) — при виборі
  // відкриває поля налаштувань (підсвітка/кольори/розміри), перед тим як
  // додати готовий елемент на полотно. Вкладка "🧩 Об'єкти" панелі "Інструменти".
  const [selectedComplexObjectId, setSelectedComplexObjectId] = useState<string | null>(null);
  const [complexObjectDraft, setComplexObjectDraft] = useState<Partial<CanvasElement>>({});

  // Довідник обчислюваних полів ЛСМД (код + українська назва + SQL-формула),
  // щоб шукати код показника, коли картці (напр. КПІ) треба прив'язати
  // реальне поле замість тестового тексту. Вкладка "Показники" панелі "Довідники".
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [openIndicatorSections, setOpenIndicatorSections] = useState<Set<string>>(new Set());
  const [copiedIndicatorCode, setCopiedIndicatorCode] = useState<string | null>(null);
  const toggleIndicatorSection = (title: string) => {
    setOpenIndicatorSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };
  const handleCopyIndicatorCode = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedIndicatorCode(code);
    setTimeout(() => setCopiedIndicatorCode((prev) => (prev === code ? null : prev)), 1200);
  };
  const normalizedIndicatorSearch = indicatorSearch.trim().toLowerCase();
  const filteredIndicatorSections = INDICATOR_SECTIONS.map((section) => ({
    ...section,
    rows: normalizedIndicatorSearch
      ? section.rows.filter(
          (row) =>
            row.code.toLowerCase().includes(normalizedIndicatorSearch) ||
            row.nameUk.toLowerCase().includes(normalizedIndicatorSearch)
        )
      : section.rows,
  })).filter((section) => section.rows.length > 0);

  // Довідник способів API-доступу до Supabase (публічний, service role,
  // пряме підключення до Postgres, GraphQL, Management API/MCP, Storage/
  // Auth/Realtime). Лише довідник: реальні ключі/паролі в env-змінних, сюди
  // не потрапляють. Вкладка "Підключення до бази" панелі "Довідники".
  const [openConnectionIds, setOpenConnectionIds] = useState<Set<string>>(new Set());
  const toggleConnectionOpen = (id: string) => {
    setOpenConnectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const SCOPE_BADGE_STYLE: Record<ConnectionScope, string> = {
    "client-safe": "bg-emerald-100 text-emerald-700",
    "server-only": "bg-red-100 text-red-700",
    tooling: "bg-slate-200 text-slate-700",
  };

  // Власні готові елементи користувача: зберігаєш виділений фрагмент
  // полотна під назвою, потім вставляєш той самий фрагмент (зі збереженою
  // внутрішньою структурою й відносним розташуванням) повторно на цій чи
  // інших сторінках. На відміну від "Складних об'єктів" (вбудовані
  // пресети), наповнення тут повністю визначає сам користувач. Вкладка
  // "📚 Бібліотека" панелі "Інструменти".
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [libraryNameDraft, setLibraryNameDraft] = useState<string>("");
  // Які пункти бібліотеки розгорнуті — показують дерево складу (з яких
  // простих елементів і в якій вкладеності зібраний цей складний елемент).
  const [openLibraryItemIds, setOpenLibraryItemIds] = useState<Set<string>>(new Set());
  const toggleLibraryItemOpen = (id: string) => {
    setOpenLibraryItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Інтерактивні зв'язки між елементами полотна — клікаєш джерело, потім
  // ціль, і між ними з'являється лінія зі стрілкою (renderConnectionsLayer).
  // linkMode вмикає режим з'єднання (звичайне виділення/drag тимчасово
  // вимкнені — клік по елементу лише з'єднує). pendingLinkSourceId —
  // елемент, обраний як джерело, але ще без пари. Вкладка "🔗 Зв'язки"
  // панелі "Інструменти".
  const [connections, setConnections] = useState<ElementConnection[]>([]);
  const [linkMode, setLinkMode] = useState<boolean>(false);
  const [pendingLinkSourceId, setPendingLinkSourceId] = useState<number | null>(null);
  // Перемикає ОДНУ функцію в масиві дій зв'язку (чекбокс) — не замінює
  // список цілком, тож на одному зв'язку можна тримати кілька функцій
  // одночасно (напр. "показати ціль" + "задає МІСЯЦЬ цілі").
  const toggleConnectionAction = (id: string, action: string) => {
    const next = connections.map((c) => {
      if (c.id !== id) return c;
      const currentActions = c.actions ?? [];
      const nextActions = currentActions.includes(action)
        ? currentActions.filter((a) => a !== action)
        : [...currentActions, action];
      return { ...c, actions: nextActions };
    });
    updateConnectionsAndHistory(next);
  };

  // Елементи, приховані дією зв'язку (show/hide/toggle) — окремо від
  // isTriggerTarget/showOnClickId (старий механізм тригерів, який зв'язки
  // навмисно не чіпають). Не зберігається в localStorage — той самий
  // принцип, що й clickedElementId/hoveredElementId (проміжний стан
  // взаємодії, не даних проєкту).
  const [connectionHiddenIds, setConnectionHiddenIds] = useState<Set<number>>(new Set());

  // Часові зв'язки (set-year/set-month/set-week/set-day) — довільна кількість
  // елементів-джерел (рік, місяць, тиждень, день — користувач сам створює
  // стільки, скільки треба конкретному показнику: комусь досить року,
  // комусь треба рік+місяць+день), кожен підключається окремим зв'язком до
  // ОДНОГО й того самого показника. Значення джерела (el.content, як
  // написав сам користувач — "2026", "Березень", "12", "15") складається в
  // el.timeContext цілі й одразу форматується в її content. Свідомо НЕ
  // тягне жодного API — targeted показник міг бути будь-яким елементом, а
  // не лише плиткою з kpiField (щоб не повторювати вже готову поведінку
  // пресету "📊 КПІ лікарні").
  // "week" — попри назву поля (лишена як є, щоб не чіпати вже готові
  // set-week/timeContext.week), тепер означає ДЕНЬ ТИЖНЯ (Понеділок…Неділя,
  // WEEKDAY_LABELS), а не номер тижня — джерело з таким пікером просто дає
  // назву дня тижня замість числа 1–53.
  const TIME_UNIT_LABELS_INSTR: Record<"year" | "month" | "week" | "day", string> = {
    year: "роком",
    month: "місяцем",
    week: "днем тижня",
    day: "днем",
  };
  // Той самий регістр/відмінок, що й текст опцій у dropdown "🔗 Зв'язки"
  // ("задає РІК цілі" тощо) — щоб підказка в Параметрах точно збігалась з
  // тим, що людина побачить у списку дій зв'язку.
  const TIME_UNIT_LABELS_NOM: Record<"year" | "month" | "week" | "day", string> = {
    year: "РІК",
    month: "МІСЯЦЬ",
    week: "ДЕНЬ ТИЖНЯ",
    day: "ДЕНЬ",
  };
  const formatTimeContext = (ctx: NonNullable<CanvasElement["timeContext"]>): string =>
    [ctx.year, ctx.month, ctx.week, ctx.day]
      .filter((part): part is string => !!part)
      .join(" · ");

  // Тягне живе число для числового посадочного місця картки, прив'язаного
  // до показника (liveBinding) — викликається лише коли підключене часове
  // джерело щойно оновило timeContext цілі (runConnectionActions нижче).
  // params, зафіксовані при прив'язці (рівень/напрямок/відділення/МКХ-10),
  // + org поточної лікарні + grain/значення з ctx (buildPeriodKey) — рядок
  // з відповіді шукається за period_label, що збігається з побудованим
  // ключем (RPC завжди повертає ВСЮ серію на обраній гранулярності, не
  // фільтр по конкретному року/місяцю).
  const resolveLiveIndicatorValue = async (
    binding: NonNullable<CanvasElement["liveBinding"]>,
    ctx: NonNullable<CanvasElement["timeContext"]>
  ): Promise<string> => {
    const period = buildPeriodKey(ctx);
    if (!period) return "—";
    // Без цих параметрів RPC поверне СЕРІЮ з кількох рядків на один і той
    // самий period_label (кілька діагнозів/лікарів за той самий рік) —
    // .find нижче мовчки взяв би перший-ліпший, довільний. Доки відповідний
    // вузол (🩻 діагностичний / 👨‍⚕️ лікарський) не підключено — лишаємо "—",
    // той самий принцип, що й для періоду вище.
    if (binding.source === "diagnoses" && !binding.params.icd) return "—";
    if (binding.source === "doctor-hierarchy" && !binding.params.doctorId) return "—";
    try {
      const params = new URLSearchParams({
        ...binding.params,
        grain: period.grain,
        org: selectedHospital?.edrpou ?? "",
      });
      const res = await fetch(`${LIVE_INDICATOR_ENDPOINTS[binding.source]}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) return "—";
      const rows = (data.rows ?? []) as Record<string, unknown>[];
      const row = rows.find((r) => r.period_label === period.label);
      if (!row) return "—";
      const raw = row[binding.field];
      return raw === null || raw === undefined ? "—" : `${raw}${binding.suffix || ""}`;
    } catch {
      return "—";
    }
  };

  const runConnectionActions = (sourceId: number) => {
    const sourceEl = elements.find((item) => item.id === sourceId);
    if (!sourceEl) return;

    // Дочірні елементи успадковують зв'язки БУДЬ-ЯКОГО предка (не лише
    // прямого) — досить підключити зв'язок один раз до самого БЛОКА чи
    // СПИСКУ, і клік по кожному з, напр., 6 вкладених кнопок-років теж його
    // запускає, зі СВОЇМ власним content/linkKey (а не батьківського
    // блока) — не треба тягнути 6 окремих ліній до однієї цілі. Той самий
    // принцип обриву, що й у hasVisibleCascadingAncestor (excludeFromCascade):
    // якщо сам sourceEl виключений — узагалі не йдемо вгору; якщо виключений
    // ПРЕДОК на шляху — зупиняємось прямо на ньому, не додаючи ні його
    // власні зв'язки, ні щось вище за нього.
    const ancestorIds = new Set<number>([sourceId]);
    if (!sourceEl.excludeFromConnectionCascade) {
      let current: CanvasElement | undefined = sourceEl;
      while (current && current.parentId !== null) {
        const parent = elements.find((item) => item.id === current!.parentId);
        if (!parent) break;
        if (parent.excludeFromConnectionCascade) break;
        ancestorIds.add(parent.id);
        current = parent;
      }
    }

    const outgoing = connections.filter((c) => ancestorIds.has(c.fromId) && c.actions && c.actions.length > 0);
    if (outgoing.length === 0) return;

    // Розгортаємо [{toId, actions:[...]}] у пласкі {toId, action} пари — одна
    // й та сама лінія-зв'язок може нести кілька дій одразу (напр. і
    // "показати ціль", і "задає МІСЯЦЬ цілі"); решта логіки нижче однакова.
    const flatActions: { toId: number; action: string }[] = [];
    outgoing.forEach((c) => c.actions!.forEach((action) => flatActions.push({ toId: c.toId, action })));

    setConnectionHiddenIds((prev) => {
      const next = new Set(prev);
      flatActions.forEach(({ toId, action }) => {
        if (action === "hide") next.add(toId);
        else if (action === "show") next.delete(toId);
        else if (action === "toggle") {
          if (next.has(toId)) next.delete(toId);
          else next.add(toId);
        } else if (action === "filter" && sourceEl?.linkKey) {
          // Ціль — цілий "Список" (toId), фільтруємо його РЯДКИ (дочірні
          // елементи): лишаємо видимими лише ті, чий linkKey збігається з
          // linkKey клікнутого джерела (той самий принцип, що й підсвітка
          // linkKey — просто ховає решту замість підсвічування).
          elements
            .filter((row) => row.parentId === toId)
            .forEach((row) => {
              if (row.linkKey === sourceEl.linkKey) next.delete(row.id);
              else next.add(row.id);
            });
        }
      });
      return next;
    });

    const timeActions = sourceEl
      ? flatActions.filter(({ action }) => action === "set-year" || action === "set-month" || action === "set-week" || action === "set-day")
      : [];
    if (sourceEl && timeActions.length > 0) {
      // Цілі з liveBinding — timeContext НАКОПИЧУЄТЬСЯ (рік і місяць
      // підключаються окремими лініями, обидва потрібні одночасно, щоб
      // побудувати "2026-03"), а не заміняється, як у звичайних цілей
      // нижче. Список fetch-ів рахуємо ЗАЗДАЛЕГІДЬ, зі стану `elements`
      // (а не всередині колбека setElements нижче): React НЕ гарантує, що
      // функціональний updater виконається синхронно одразу після виклику
      // setElements — читання побічного ефекту updater'а одразу після
      // виклику (як тут спершу й було зроблено) застало б ще порожній
      // масив. `elements` у цьому замиканні лишається чинним, бо в межах
      // одного синхронного обробника кліку його ніщо інше не встигає змінити.
      const liveFetches: {
        targetId: number;
        binding: NonNullable<CanvasElement["liveBinding"]>;
        nextContext: NonNullable<CanvasElement["timeContext"]>;
      }[] = [];
      timeActions.forEach(({ toId, action }) => {
        const target = elements.find((item) => item.id === toId);
        if (!target?.liveBinding) return;
        const unit = action.replace("set-", "") as "year" | "month" | "week" | "day";
        const nextContext = { ...(target.timeContext ?? {}), [unit]: sourceEl.content };
        liveFetches.push({ targetId: target.id, binding: target.liveBinding, nextContext });
      });

      setElements((prev) => {
        const next = [...prev];
        timeActions.forEach(({ toId, action }) => {
          const unit = action.replace("set-", "") as "year" | "month" | "week" | "day";
          const targetIdx = next.findIndex((item) => item.id === toId);
          if (targetIdx === -1) return;
          const target = next[targetIdx];

          if (target.liveBinding) {
            const nextContext = { ...(target.timeContext ?? {}), [unit]: sourceEl.content };
            next[targetIdx] = { ...target, timeContext: nextContext };
          } else if (target.isBadgeYearField && unit !== "year") {
            // Джерело місяця/тижня/дня, підключене до поля-РОКУ бейджа — не
            // дописується в сам рік: рік стискається й підіймається вгору,
            // а під ним створюється (один раз) чи оновлюється рядок дати.
            const dateSubIdx = target.badgeDateSubId != null ? next.findIndex((item) => item.id === target.badgeDateSubId) : -1;
            const prevDateContext = dateSubIdx !== -1 ? next[dateSubIdx].timeContext ?? {} : {};
            const nextDateContext = { ...prevDateContext, [unit]: sourceEl.content };
            // .date-sub в оригіналі (hospital-analytics) — text-transform:
            // uppercase; тут немає CSS-класу під це, тож капіталізуємо сам
            // текст. timeContext лишається з "сирими" значеннями джерел
            // (напр. "Понеділок"), капіталізація — лише при показі.
            const formatted = formatTimeContext(nextDateContext).toUpperCase();

            if (dateSubIdx === -1) {
              const dateSubHeight = 26;
              const newYearHeight = target.height - dateSubHeight;
              const dateSub: CanvasElement = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                pageId: target.pageId,
                isGlobal: false,
                isTriggerTarget: false,
                showOnHoverId: null,
                showOnClickId: null,
                type: "text",
                content: formatted,
                width: target.width,
                height: dateSubHeight,
                x: target.x,
                y: target.y + newYearHeight,
                textColor: target.textColor,
                padding: 0,
                borderRadius: 0,
                fontSize: 15,
                fontFamily: target.fontFamily,
                fontWeight: "300",
                textAlign: target.textAlign,
                bgOpacity: 0,
                parentId: target.parentId,
                timeContext: nextDateContext,
                isBadgeDateSubField: true,
              };
              next[targetIdx] = { ...target, height: newYearHeight, fontSize: 48, badgeDateSubId: dateSub.id };
              next.push(dateSub);
            } else {
              next[dateSubIdx] = { ...next[dateSubIdx], content: formatted, timeContext: nextDateContext };
            }
          } else if (target.isBadgeDateSubField) {
            // Зв'язок підключили НАПРЯМУ до вже створеного рядка дати (не до
            // поля-року, яке його породило) — той самий стиль: складання в
            // ЙОГО ВЛАСНИЙ timeContext і капіталізація, а не сирий текст
            // джерела як є. Стиль бейджа не залежить від того, куди саме з
            // двох полів підключили зв'язок.
            const nextOwnContext = { ...(target.timeContext ?? {}), [unit]: sourceEl.content };
            next[targetIdx] = {
              ...target,
              content: formatTimeContext(nextOwnContext).toUpperCase(),
              timeContext: nextOwnContext,
            };
          } else {
            // Звичайна (не-бейджева) ціль — новий клік ПОВНІСТЮ заміняє
            // зміст, а не додається до попереднього (рік/місяць тощо не
            // накопичуються в один рядок). Складання кількох одиниць в один
            // рядок лишається лише для рядків дати бейджа вище.
            next[targetIdx] = { ...target, content: sourceEl.content, timeContext: { [unit]: sourceEl.content } };
          }
        });
        saveToHistory(pages, next);
        return next;
      });

      liveFetches.forEach(({ targetId, binding, nextContext }) => {
        void resolveLiveIndicatorValue(binding, nextContext).then((value) => {
          setElements((prev) => {
            const next = prev.map((item) => (item.id === targetId ? { ...item, content: value } : item));
            saveToHistory(pages, next);
            return next;
          });
        });
      });
    }

    // Параметричні джерела (set-icd/set-doctor) — на відміну від часових,
    // тут РІВНО один параметр на дію, без накопичення: новий клік просто
    // перезаписує попереднє значення в liveBinding.params. "Лікарський
    // вузол" бере id з linkKey джерела (справжній resource_id рядка
    // Ординаторської), а не з content (там ім'я лікаря, не id) — з
    // фолбеком на content для довільного вручну зробленого джерела без
    // linkKey. Список fetch-ів так само рахуємо ЗАЗДАЛЕГІДЬ зі стану
    // `elements` — та сама причина, що й у liveFetches вище.
    const paramActions = sourceEl ? flatActions.filter(({ action }) => action in PARAM_ACTION_KEY) : [];
    if (sourceEl && paramActions.length > 0) {
      const nextParamValue = (action: string) => (action === "set-doctor" ? sourceEl.linkKey ?? sourceEl.content : sourceEl.content);

      const paramFetches: {
        targetId: number;
        binding: NonNullable<CanvasElement["liveBinding"]>;
        ctx: NonNullable<CanvasElement["timeContext"]>;
      }[] = [];
      paramActions.forEach(({ toId, action }) => {
        const target = elements.find((item) => item.id === toId);
        if (!target?.liveBinding) return;
        const key = PARAM_ACTION_KEY[action];
        const nextBinding = { ...target.liveBinding, params: { ...target.liveBinding.params, [key]: nextParamValue(action) } };
        paramFetches.push({ targetId: target.id, binding: nextBinding, ctx: target.timeContext ?? {} });
      });

      setElements((prev) => {
        const next = [...prev];
        paramActions.forEach(({ toId, action }) => {
          const targetIdx = next.findIndex((item) => item.id === toId);
          if (targetIdx === -1) return;
          const target = next[targetIdx];
          if (!target.liveBinding) return;
          const key = PARAM_ACTION_KEY[action];
          next[targetIdx] = {
            ...target,
            liveBinding: { ...target.liveBinding, params: { ...target.liveBinding.params, [key]: nextParamValue(action) } },
          };
        });
        saveToHistory(pages, next);
        return next;
      });

      paramFetches.forEach(({ targetId, binding, ctx }) => {
        void resolveLiveIndicatorValue(binding, ctx).then((value) => {
          setElements((prev) => {
            const next = prev.map((item) => (item.id === targetId ? { ...item, content: value } : item));
            saveToHistory(pages, next);
            return next;
          });
        });
      });
    }
  };

  // Власні складні об'єкти користувача (панель "Складні об'єкти") — той
  // самий принцип збереження, що й "Бібліотека" вище: виділяєш прості
  // фігури на полотні, зберігаєш під назвою, і вони з'являються тут поруч
  // із вбудованими пресетами COMPLEX_OBJECTS.
  const [customComplexObjects, setCustomComplexObjects] = useState<CustomComplexObject[]>([]);
  const [complexObjectNameDraft, setComplexObjectNameDraft] = useState<string>("");
  const [openCustomComplexObjectIds, setOpenCustomComplexObjectIds] = useState<Set<string>>(new Set());
  const toggleCustomComplexObjectOpen = (id: string) => {
    setOpenCustomComplexObjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Пошук пацієнта — не окрема панель, а один із пунктів "Складні об'єкти"
  // (selectedComplexObjectId === "patient-search"): пошук по
  // /api/patients/search (service_role, лише сервер), вибір результату і
  // побудова картки (список "Поле"/"Значення" з усіма полями) на полотні.
  // Навмисно НЕ через Публічний API/anon-ключ — див. панель "Підключення до бази".
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState<PatientRecord[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);

  const handleSearchPatients = async () => {
    const q = patientSearchQuery.trim();
    if (q.length < 2) {
      setPatientSearchError("Введіть щонайменше 2 символи");
      return;
    }
    setPatientSearchLoading(true);
    setPatientSearchError(null);
    setSelectedPatient(null);
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}&org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      if (!res.ok) {
        setPatientSearchError(data.error || "Помилка пошуку");
        setPatientSearchResults([]);
        return;
      }
      setPatientSearchResults(data.patients || []);
      if ((data.patients || []).length === 0) setPatientSearchError("Нічого не знайдено");
    } catch {
      setPatientSearchError("Не вдалося звернутись до сервера");
      setPatientSearchResults([]);
    } finally {
      setPatientSearchLoading(false);
    }
  };

  // Будує елемент "Список" зі стовпцями "Поле"/"Значення" — по одному рядку
  // на кожне поле вибраного пацієнта, той самий підхід, що й для відділень.
  const handleAddPatientCard = () => {
    if (!selectedPatient) return;
    const columns: ListColumn[] = [
      { id: "field", label: "Поле", width: 1.5 },
      { id: "value", label: "Значення", width: 2 },
    ];
    const listId = Date.now();
    const cardWidth = 360;
    const cardHeight = 520;
    const freePos = findFreePosition(forcedParentId, cardWidth, cardHeight);
    const listElement: CanvasElement = {
      id: listId,
      pageId: currentPageId,
      isGlobal: false,
      isTriggerTarget: false,
      showOnHoverId: null,
      showOnClickId: null,
      type: "list",
      content: `Пацієнт: ${formatPatientFieldValue(selectedPatient.full_name)}`,
      width: cardWidth,
      height: cardHeight,
      x: freePos.x,
      y: freePos.y,
      textColor: "#ffffff",
      padding: 8,
      borderRadius: 0,
      fontSize: 12,
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
      fontWeight: "500",
      textAlign: "left",
      parentId: forcedParentId,
      targetPageId: null,
      columns,
    };
    const rowElements: CanvasElement[] = PATIENT_FIELD_LABELS.map((f, i) => ({
      id: listId + 1 + i,
      pageId: currentPageId,
      isGlobal: false,
      isTriggerTarget: false,
      showOnHoverId: null,
      showOnClickId: null,
      type: "text",
      content: f.label,
      width: 120,
      height: 26,
      x: 1,
      y: 1,
      textColor: "#000000",
      padding: 4,
      borderRadius: 0,
      fontSize: 12,
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
      fontWeight: "500",
      textAlign: "left",
      parentId: listId,
      targetPageId: null,
      columnValues: {
        field: f.label,
        value: formatPatientFieldValue(selectedPatient[f.key]),
      },
    }));
    updateElementsAndHistory([...elements, listElement, ...rowElements]);
    handleSelectElement(listId);
  };

  // Пошук лікаря — той самий принцип, що й пошук пацієнта, лише інше
  // джерело: public.mv_doctor_full (/api/doctors/search, service_role —
  // view не має GRANT на anon/authenticated).
  const [doctorSearchQuery, setDoctorSearchQuery] = useState("");
  const [doctorSearchResults, setDoctorSearchResults] = useState<LpzEntityRecord[]>([]);
  const [doctorSearchLoading, setDoctorSearchLoading] = useState(false);
  const [doctorSearchError, setDoctorSearchError] = useState<string | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<LpzEntityRecord | null>(null);

  const handleSearchDoctors = async () => {
    const q = doctorSearchQuery.trim();
    if (q.length < 2) {
      setDoctorSearchError("Введіть щонайменше 2 символи");
      return;
    }
    setDoctorSearchLoading(true);
    setDoctorSearchError(null);
    setSelectedDoctor(null);
    try {
      const res = await fetch(`/api/doctors/search?q=${encodeURIComponent(q)}&org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      if (!res.ok) {
        setDoctorSearchError(data.error || "Помилка пошуку");
        setDoctorSearchResults([]);
        return;
      }
      setDoctorSearchResults(data.doctors || []);
      if ((data.doctors || []).length === 0) setDoctorSearchError("Нічого не знайдено");
    } catch {
      setDoctorSearchError("Не вдалося звернутись до сервера");
      setDoctorSearchResults([]);
    } finally {
      setDoctorSearchLoading(false);
    }
  };

  const handleAddDoctorCard = () => {
    if (!selectedDoctor) return;
    const columns: ListColumn[] = [
      { id: "field", label: "Поле", width: 1.5 },
      { id: "value", label: "Значення", width: 2 },
    ];
    const listId = Date.now();
    const cardWidth = 320;
    const cardHeight = 420;
    const freePos = findFreePosition(forcedParentId, cardWidth, cardHeight);
    const listElement: CanvasElement = {
      id: listId,
      pageId: currentPageId,
      isGlobal: false,
      isTriggerTarget: false,
      showOnHoverId: null,
      showOnClickId: null,
      type: "list",
      content: `Лікар: ${formatLpzFieldValue(selectedDoctor.full_name)}`,
      width: cardWidth,
      height: cardHeight,
      x: freePos.x,
      y: freePos.y,
      textColor: "#ffffff",
      padding: 8,
      borderRadius: 0,
      fontSize: 12,
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
      fontWeight: "500",
      textAlign: "left",
      parentId: forcedParentId,
      targetPageId: null,
      columns,
    };
    const rowElements: CanvasElement[] = DOCTOR_FIELD_LABELS.map((f, i) => ({
      id: listId + 1 + i,
      pageId: currentPageId,
      isGlobal: false,
      isTriggerTarget: false,
      showOnHoverId: null,
      showOnClickId: null,
      type: "text",
      content: f.label,
      width: 120,
      height: 26,
      x: 1,
      y: 1,
      textColor: "#000000",
      padding: 4,
      borderRadius: 0,
      fontSize: 12,
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
      fontWeight: "500",
      textAlign: "left",
      parentId: listId,
      targetPageId: null,
      columnValues: {
        field: f.label,
        value: formatLpzFieldValue(selectedDoctor[f.key]),
      },
    }));
    updateElementsAndHistory([...elements, listElement, ...rowElements]);
    handleSelectElement(listId);
  };

  // Пошук відділення (реальні дані) — та сама механіка, що й пошук
  // пацієнта/лікаря, але джерело — RPC public.lpz_department_stats
  // (/api/departments/stats, service_role): рахує напряму з
  // lpz.lpz_hospitalizations, бо готовий view v_department_stats (public)
  // порожній через баг у v_case_metrics.discharge_department (ніде не
  // заповнене в базовому шарі).
  const [deptStatsQuery, setDeptStatsQuery] = useState("");
  const [deptStatsResults, setDeptStatsResults] = useState<LpzEntityRecord[]>([]);
  const [deptStatsLoading, setDeptStatsLoading] = useState(false);
  const [deptStatsError, setDeptStatsError] = useState<string | null>(null);
  const [selectedDeptStat, setSelectedDeptStat] = useState<LpzEntityRecord | null>(null);

  const handleSearchDeptStats = async () => {
    const q = deptStatsQuery.trim();
    if (q.length < 2) {
      setDeptStatsError("Введіть щонайменше 2 символи");
      return;
    }
    setDeptStatsLoading(true);
    setDeptStatsError(null);
    setSelectedDeptStat(null);
    try {
      const res = await fetch(`/api/departments/stats?q=${encodeURIComponent(q)}&org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      if (!res.ok) {
        setDeptStatsError(data.error || "Помилка пошуку");
        setDeptStatsResults([]);
        return;
      }
      setDeptStatsResults(data.departments || []);
      if ((data.departments || []).length === 0) setDeptStatsError("Нічого не знайдено");
    } catch {
      setDeptStatsError("Не вдалося звернутись до сервера");
      setDeptStatsResults([]);
    } finally {
      setDeptStatsLoading(false);
    }
  };

  const handleAddDeptStatCard = () => {
    if (!selectedDeptStat) return;
    const columns: ListColumn[] = [
      { id: "field", label: "Поле", width: 1.5 },
      { id: "value", label: "Значення", width: 2 },
    ];
    const listId = Date.now();
    const cardWidth = 320;
    const cardHeight = 260;
    const freePos = findFreePosition(forcedParentId, cardWidth, cardHeight);
    const listElement: CanvasElement = {
      id: listId,
      pageId: currentPageId,
      isGlobal: false,
      isTriggerTarget: false,
      showOnHoverId: null,
      showOnClickId: null,
      type: "list",
      content: `Відділення: ${formatLpzFieldValue(selectedDeptStat.department_name)}`,
      width: cardWidth,
      height: cardHeight,
      x: freePos.x,
      y: freePos.y,
      textColor: "#ffffff",
      padding: 8,
      borderRadius: 0,
      fontSize: 12,
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
      fontWeight: "500",
      textAlign: "left",
      parentId: forcedParentId,
      targetPageId: null,
      columns,
    };
    const rowElements: CanvasElement[] = DEPARTMENT_STAT_FIELD_LABELS.map((f, i) => ({
      id: listId + 1 + i,
      pageId: currentPageId,
      isGlobal: false,
      isTriggerTarget: false,
      showOnHoverId: null,
      showOnClickId: null,
      type: "text",
      content: f.label,
      width: 120,
      height: 26,
      x: 1,
      y: 1,
      textColor: "#000000",
      padding: 4,
      borderRadius: 0,
      fontSize: 12,
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
      fontWeight: "500",
      textAlign: "left",
      parentId: listId,
      targetPageId: null,
      columnValues: {
        field: f.label,
        value: formatLpzFieldValue(selectedDeptStat[f.key]),
      },
    }));
    updateElementsAndHistory([...elements, listElement, ...rowElements]);
    handleSelectElement(listId);
  };

  // "🏥 Лікарня (назва + емблема)" — довідник lpz.lpz_organizations (2 записи,
  // прив'язані за edrpou), /api/organizations. Список тягнеться один раз
  // (ensureOrgList, той самий принцип, що й ensureStaffDeptList). 1:1 порт
  // .logo/.name-block .title з hospital-analytics (public/shared/layout.css,
  // рендер — public/js/utils.js:initHospitalName): лого 160×160 зліва
  // (0.9x до .logo { width:160px }), назва — text-елемент 315px праворуч із
  // відступом 25px (221-36-160 в оригіналі), 28.8px, вагою 300, ВЕЛИКИМИ,
  // колір #3a3a3a (--c-ink-3), розбита по словах на окремі рядки (в
  // оригіналі — title.innerHTML = display_name.split(' ').join('<br>');
  // текстовий елемент тут не рендерить HTML, тож перенесено як символ
  // переносу рядка '\n' у content, який whitespace-pre-wrap показує так само).
  // Лого й назва — окремі діти одного прозорого батька, не один злитий напис.
  type HospitalOrg = {
    edrpou: string;
    name: string;
    short_name: string;
    display_name: string;
    tagline: string | null;
    logo_url: string | null;
  };
  const [orgList, setOrgList] = useState<HospitalOrg[] | null>(null);
  const [orgListLoading, setOrgListLoading] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<HospitalOrg | null>(null);

  // Активна лікарня проєкту (одна на весь проєкт, усі сторінки) — визначає
  // тему кольорів (lib/hospital-themes.ts) для НОВИХ елементів, що будуть
  // створені далі; вже розміщені на полотні елементи не перефарбовує
  // заднім числом. Встановлюється через handleAddHospitalOrgCard (вибір
  // лікарні в "🧩 Об'єкти" одразу і додає картку, і робить її активною) —
  // окремого "гейту" на старті немає, старі проєкти без вибраної лікарні
  // просто лишаються на дефолтній темі Хотина (DEFAULT_HOSPITAL_THEME).
  const [selectedHospital, setSelectedHospital] = useState<HospitalOrg | null>(null);

  const ensureOrgList = async () => {
    if (orgList !== null || orgListLoading) return;
    setOrgListLoading(true);
    try {
      const res = await fetch("/api/organizations");
      const data = await res.json();
      setOrgList(res.ok && data.organizations ? data.organizations : []);
    } catch {
      setOrgList([]);
    } finally {
      setOrgListLoading(false);
    }
  };

  // Список лікарень треба мати одразу при завантаженні (не лише при відкритті
  // "🧩 Об'єкти") — доки лікарню не обрано, панель "🧱 Інструменти" показує
  // ТІЛЬКИ цей вибір (гейт нижче, activePanelTab/вкладки ще не рендеряться).
  useEffect(() => {
    ensureOrgList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddHospitalOrgCard = () => {
    if (!selectedOrg) return;
    const theme = getHospitalTheme(selectedOrg.edrpou);
    const logoSize = 160; // .logo { width: 160px } (layout.css) — object-contain зберігає пропорції SVG
    const gap = 25; // 221 - 36 - 160 (left name-block − left logo − width logo, layout.css)
    const nameWidth = 315; // .name-block { width: 315px }
    const cardWidth = logoSize + gap + nameWidth;
    const cardHeight = logoSize;
    const freePos = findFreePosition(forcedParentId, cardWidth, cardHeight);
    const parentId = Date.now();

    const parentElement: CanvasElement = {
      id: parentId,
      pageId: currentPageId,
      isGlobal: false,
      isTriggerTarget: false,
      showOnHoverId: null,
      showOnClickId: null,
      type: "block",
      content: "",
      width: cardWidth,
      height: cardHeight,
      x: freePos.x,
      y: freePos.y,
      textColor: "#1a1a1a",
      padding: 0,
      borderRadius: 0,
      fontSize: 12,
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
      fontWeight: "500",
      textAlign: "left",
      parentId: forcedParentId,
      targetPageId: null,
      customBgColor: "#ffffff",
      bgOpacity: 0,
    };

    const emblemElement: CanvasElement = {
      id: parentId + 1,
      pageId: currentPageId,
      isGlobal: false,
      isTriggerTarget: false,
      showOnHoverId: null,
      showOnClickId: null,
      type: "image",
      content: selectedOrg.display_name,
      width: logoSize,
      height: logoSize,
      x: 0,
      y: 0,
      textColor: "#1a1a1a",
      padding: 0,
      borderRadius: 0,
      fontSize: 12,
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
      fontWeight: "500",
      textAlign: "left",
      parentId,
      targetPageId: null,
      bgOpacity: 0,
      imageUrl: selectedOrg.logo_url || "",
    };

    const nameElement: CanvasElement = {
      id: parentId + 2,
      pageId: currentPageId,
      isGlobal: false,
      isTriggerTarget: false,
      showOnHoverId: null,
      showOnClickId: null,
      type: "text",
      content: (selectedOrg.display_name || "").toUpperCase().split(" ").join("\n"),
      width: nameWidth,
      height: logoSize,
      x: logoSize + gap,
      y: 0,
      textColor: theme.ink3, // --c-ink-3, per-лікарня (lib/hospital-themes.ts)
      padding: 0,
      borderRadius: 0,
      fontSize: 28.8, // .title { font-size: 28.8px } (layout.css)
      lineHeight: 1, // .title { line-height: 1.0 } (layout.css) — типовий leading-normal (1.5) тут занадто розрідив би 3 рядки
      // Реальний layout.html підключає Cormorant Garamond (subset=cyrillic)
      // через Google Fonts — 'ITFLight' у font-family body ніде фактично не
      // задекларований (@font-face немає), а сам файл ITFDevanagari-Light.ttf
      // кирилиці не містить, тож те посилання й так завжди мовчки падало у
      // Palatino. Cormorant Garamond тут вже є (layout.tsx, var(--font-cormorant),
      // subsets: cyrillic+latin, ваги 300 і 700) — саме той шрифт, що й на
      // реальній сторінці, лише жирнішим накресленням.
      fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
      fontWeight: "700", // жирне накреслення (layout.tsx вантажить Cormorant Garamond у 300 і 700)
      textAlign: "left",
      parentId,
      targetPageId: null,
      bgOpacity: 0,
    };

    updateElementsAndHistory([...elements, parentElement, emblemElement, nameElement]);
    setSelectedIds([parentId]);
    // Ця лікарня стає активною для всього проєкту (тема кольорів для
    // подальшого створення елементів) — вибір і додавання картки це одна дія.
    setSelectedHospital(selectedOrg);
  };

  // Які вузли ієрархії в бічній панелі згорнуті (не показують своїх дочірніх елементів)
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

  // Вкладки головної панелі управління — замість одного суцільного скролу
  // (Створити елемент + Ієрархія + Сторінка + Параметри в одному стовпці).
  // "params" відкривається автоматично при виборі елемента (див. ефект нижче).
  const [activePanelTab, setActivePanelTab] = useState<
    "create" | "page" | "params" | "complex" | "library" | "links"
  >("create");

  // Які кольорові секції всередині вкладки "Параметри" розгорнуті — акордеон,
  // не взаємовиключний (можна тримати відкритими кілька одразу). Позиція,
  // розмір і вигляд відкриті за замовчуванням (найчастіше потрібні), видимість
  // і тригери — згорнуті, доки не розгорнуть вручну.
  const DEFAULT_OPEN_PARAM_SECTIONS = ["position", "appearance", "list", "button"];
  const [openParamSections, setOpenParamSections] = useState<Set<string>>(
    new Set(DEFAULT_OPEN_PARAM_SECTIONS)
  );
  const toggleParamSection = (key: string) => {
    setOpenParamSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Захист від "паразитного" кліку по порожньому полотну одразу після
  // drag/resize. Вкладений елемент обмежений bounds="parent" — якщо курсор
  // під час перетягування виїжджає за межі тісного батька (а плитки КПІ,
  // картки відділення/лікаря тощо саме такі — впритул заповнені дочірніми
  // текстами), сам елемент коректно лишається в межах батька, але mouseup
  // відбувається вже над порожнім <main>. За стандартом DOM click спливає
  // до найближчого спільного предка mousedown/mouseup-цілей — а це <main>
  // (він предок і елемента, і порожньої області) — тож клік там одразу
  // скидає щойно встановлене виділення, і перетягування виглядає так, ніби
  // "нічого не відбулось". onDragStop/onResizeStop виставляють цей прапорець,
  // <main>-клік перевіряє й одноразово гасить сам себе.
  const suppressNextCanvasClickRef = useRef(false);

  // newConnections не обов'язковий — якщо конкретна зміна не чіпає самі
  // зв'язки (напр. звичайне перетягування елемента), береться поточне
  // значення connections із замикання. Виклики, що МІНЯЮТЬ саме connections
  // (створення/видалення зв'язку, перемикання функції), мусять передати
  // його явно — інакше в history потрапить ще стара версія (setConnections
  // асинхронний, як і будь-який setState).
  const saveToHistory = (newPages: Page[], newElements: CanvasElement[], newConnections: ElementConnection[] = connections) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    updatedHistory.push({ pages: newPages, elements: newElements, connections: newConnections });

    if (updatedHistory.length > 30) updatedHistory.shift();

    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
  };

  useEffect(() => {
    setIsMounted(true);
    const savedElements = localStorage.getItem("mis_canvas_elements_multipage");
    const savedPages = localStorage.getItem("mis_canvas_pages_list");

    let initialPages = pages;
    let initialElements = elements;
    let initialConnections: ElementConnection[] = connections;

    if (savedPages) {
      try {
        initialPages = JSON.parse(savedPages);
        setPages(initialPages);
        // Якщо збережені сторінки не містять поточної currentPageId (напр. дефолтної
        // "home" з першого запуску) — переходимо на першу реальну сторінку зі списку,
        // інакше після завантаження показувались би лише глобальні елементи.
        if (initialPages.length > 0 && !initialPages.some((p: Page) => p.id === currentPageId)) {
          setCurrentPageId(initialPages[0].id);
        }
      } catch (e) {}
    }
    if (savedElements) {
      try {
        initialElements = JSON.parse(savedElements);
        setElements(initialElements);
      } catch (e) {}
    }

    const savedPanelPos = localStorage.getItem("mis_canvas_panel_pos");
    const savedPanelSize = localStorage.getItem("mis_canvas_panel_size");
    const savedPanelOpacity = localStorage.getItem("mis_canvas_panel_opacity");
    const savedToolsPanelCollapsed = localStorage.getItem("mis_canvas_tools_panel_collapsed");
    if (savedPanelPos) {
      try { setPanelPos(clampPanelPos(JSON.parse(savedPanelPos))); } catch (e) {}
    }
    if (savedPanelSize) {
      try { setPanelSize(JSON.parse(savedPanelSize)); } catch (e) {}
    }
    if (savedPanelOpacity) {
      try { setPanelOpacity(JSON.parse(savedPanelOpacity)); } catch (e) {}
    }
    if (savedToolsPanelCollapsed) {
      try { setToolsPanelCollapsed(JSON.parse(savedToolsPanelCollapsed)); } catch (e) {}
    }

    const savedOpenParamSections = localStorage.getItem("mis_canvas_open_param_sections");
    if (savedOpenParamSections) {
      try { setOpenParamSections(new Set(JSON.parse(savedOpenParamSections))); } catch (e) {}
    }

    const savedRefsPanelPos = localStorage.getItem("mis_canvas_refs_panel_pos");
    const savedRefsPanelSize = localStorage.getItem("mis_canvas_refs_panel_size");
    const savedRefsPanelOpacity = localStorage.getItem("mis_canvas_refs_panel_opacity");
    const savedRefsPanelCollapsed = localStorage.getItem("mis_canvas_refs_panel_collapsed");
    if (savedRefsPanelPos) {
      try { setRefsPanelPos(clampPanelPos(JSON.parse(savedRefsPanelPos))); } catch (e) {}
    }
    if (savedRefsPanelSize) {
      try { setRefsPanelSize(JSON.parse(savedRefsPanelSize)); } catch (e) {}
    }
    if (savedRefsPanelOpacity) {
      try { setRefsPanelOpacity(JSON.parse(savedRefsPanelOpacity)); } catch (e) {}
    }
    if (savedRefsPanelCollapsed) {
      try { setRefsPanelCollapsed(JSON.parse(savedRefsPanelCollapsed)); } catch (e) {}
    }

    const savedLibraryItems = localStorage.getItem("mis_canvas_library_items");
    if (savedLibraryItems) {
      try { setLibraryItems(JSON.parse(savedLibraryItems)); } catch (e) {}
    }

    const savedConnections = localStorage.getItem("mis_canvas_connections");
    if (savedConnections) {
      try {
        initialConnections = JSON.parse(savedConnections);
        setConnections(initialConnections);
      } catch (e) {}
    }

    const savedCustomComplexObjects = localStorage.getItem("mis_canvas_custom_complex_objects");
    if (savedCustomComplexObjects) {
      try { setCustomComplexObjects(JSON.parse(savedCustomComplexObjects)); } catch (e) {}
    }

    const savedSelectedHospital = localStorage.getItem("mis_canvas_selected_hospital");
    if (savedSelectedHospital) {
      try { setSelectedHospital(JSON.parse(savedSelectedHospital)); } catch (e) {}
    }

    setHistory([{ pages: initialPages, elements: initialElements, connections: initialConnections }]);
    setHistoryIndex(0);
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("mis_canvas_elements_multipage", JSON.stringify(elements));
      localStorage.setItem("mis_canvas_pages_list", JSON.stringify(pages));
      localStorage.setItem("mis_canvas_panel_pos", JSON.stringify(panelPos));
      localStorage.setItem("mis_canvas_panel_size", JSON.stringify(panelSize));
      localStorage.setItem("mis_canvas_panel_opacity", JSON.stringify(panelOpacity));
      localStorage.setItem("mis_canvas_tools_panel_collapsed", JSON.stringify(toolsPanelCollapsed));
      localStorage.setItem("mis_canvas_open_param_sections", JSON.stringify(Array.from(openParamSections)));
      localStorage.setItem("mis_canvas_refs_panel_pos", JSON.stringify(refsPanelPos));
      localStorage.setItem("mis_canvas_refs_panel_size", JSON.stringify(refsPanelSize));
      localStorage.setItem("mis_canvas_refs_panel_opacity", JSON.stringify(refsPanelOpacity));
      localStorage.setItem("mis_canvas_refs_panel_collapsed", JSON.stringify(refsPanelCollapsed));
      localStorage.setItem("mis_canvas_library_items", JSON.stringify(libraryItems));
      localStorage.setItem("mis_canvas_connections", JSON.stringify(connections));
      localStorage.setItem("mis_canvas_custom_complex_objects", JSON.stringify(customComplexObjects));
      localStorage.setItem("mis_canvas_selected_hospital", JSON.stringify(selectedHospital));
    }
  }, [
    elements,
    pages,
    panelPos,
    panelSize,
    panelOpacity,
    toolsPanelCollapsed,
    openParamSections,
    refsPanelPos,
    refsPanelSize,
    refsPanelOpacity,
    refsPanelCollapsed,
    libraryItems,
    connections,
    customComplexObjects,
    selectedHospital,
    isMounted,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        handleDuplicateSelected();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history, historyIndex, selectedIds, elements]);

  // clampPanelPos (вище) захищає лише завантаження/імпорт — якщо вікно
  // зменшили ВЖЕ під час роботи (напр. звузили браузер чи повернули
  // ноутбук в інший монітор), збережена позиція так і лишалась би поза
  // екраном аж до наступного перезавантаження сторінки. 'resize' підтягує
  // обидві панелі назад одразу, без релоаду.
  useEffect(() => {
    const handleWindowResize = () => {
      setPanelPos((prev) => clampPanelPos(prev));
      setRefsPanelPos((prev) => clampPanelPos(prev));
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevState = history[prevIndex];
      setPages(prevState.pages);
      setElements(prevState.elements);
      setConnections(prevState.connections ?? []);
      setHistoryIndex(prevIndex);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextState = history[nextIndex];
      setPages(nextState.pages);
      setElements(nextState.elements);
      setConnections(nextState.connections ?? []);
      setHistoryIndex(nextIndex);
    }
  };

  const updateElementsAndHistory = (newElements: CanvasElement[]) => {
    setElements(newElements);
    saveToHistory(pages, newElements);
  };

  const updatePagesAndHistory = (newPages: Page[]) => {
    setPages(newPages);
    saveToHistory(newPages, elements);
  };

  // Той самий принцип, що й updateElementsAndHistory/updatePagesAndHistory —
  // будь-яка зміна самих зв'язків (створення/видалення/перемикання функції)
  // теж мусить лишати крок в історії, інакше Ctrl+Z відкочує елементи, а
  // зв'язки лишаються старими (розсинхрон).
  const updateConnectionsAndHistory = (newConnections: ElementConnection[]) => {
    setConnections(newConnections);
    saveToHistory(pages, elements, newConnections);
  };

  const handleAddPage = () => {
    const pageNum = pages.length + 1;
    const newPage: Page = {
      id: `page-${Date.now()}`,
      name: `Сторінка ${pageNum}`,
    };
    const nextPages = [...pages, newPage];
    updatePagesAndHistory(nextPages);
    setCurrentPageId(newPage.id);
  };

  const handleUpdateCurrentPageName = (newName: string) => {
    const nextPages = pages.map((p) => (p.id === currentPageId ? { ...p, name: newName } : p));
    updatePagesAndHistory(nextPages);
  };

  const handleToggleMeshBackground = (checked: boolean) => {
    const nextPages = pages.map((p) => (p.id === currentPageId ? { ...p, meshBackground: checked } : p));
    updatePagesAndHistory(nextPages);
  };

  const handleUpdateCurrentPageMeshField = (field: "meshSpeed" | "meshIntensity" | "meshColors", value: number | string[]) => {
    const nextPages = pages.map((p) => (p.id === currentPageId ? { ...p, [field]: value } : p));
    updatePagesAndHistory(nextPages);
  };

  const handleDeleteCurrentPage = () => {
    if (pages.length <= 1) {
      alert("Неможливо видалити останню сторінку!");
      return;
    }
    if (confirm("Видалити цю сторінку та всі її елементи?")) {
      const remainingPages = pages.filter((p) => p.id !== currentPageId);
      const remainingElements = elements.filter((el) => el.pageId !== currentPageId);
      const deletedIds = new Set(
        elements.filter((el) => el.pageId === currentPageId).map((el) => el.id)
      );
      const remainingConnections = connections.filter((c) => !deletedIds.has(c.fromId) && !deletedIds.has(c.toId));

      setPages(remainingPages);
      setElements(remainingElements);
      setConnections(remainingConnections);
      saveToHistory(remainingPages, remainingElements, remainingConnections);

      setCurrentPageId(remainingPages[0].id);
    }
  };

  const currentPage = pages.find((p) => p.id === currentPageId) || pages[0];

  // Чи видимий елемент на сторінці pageId — власна сторінка, власний isGlobal,
  // конкретно вибрана додаткова сторінка (extraPageIds), або каскад від предка.
  const isVisibleOnPage = (el: CanvasElement, pageId: string): boolean => {
    if (el.isGlobal === true || el.pageId === pageId || (el.extraPageIds?.includes(pageId) ?? false)) {
      return true;
    }
    return hasVisibleCascadingAncestor(el, pageId);
  };

  // Йдемо вгору по предках. Якщо предок сам видимий на pageId (з будь-якої
  // причини — 🌍, конкретна сторінка, або теж каскадом від когось вище) і має
  // увімкнений cascadeGlobal — усі його нащадки успадковують цю саму видимість
  // на pageId. Каскад працює з будь-якого рівня ієрархії, не лише з кореня.
  // Якщо на шляху трапляється предок з excludeFromCascade — каскад від усього,
  // що вище нього, обривається саме тут, разом з усім вкладеним нижче.
  const hasVisibleCascadingAncestor = (el: CanvasElement, pageId: string): boolean => {
    // Сам елемент вийшов з каскаду — не отримує видимість від жодного предка.
    if (el.excludeFromCascade) return false;

    let current = elements.find((p) => p.id === el.parentId);
    while (current) {
      if (current.excludeFromCascade) return false;
      if (current.cascadeGlobal && isVisibleOnPage(current, pageId)) return true;
      current = elements.find((p) => p.id === current!.parentId);
    }
    return false;
  };

  // Ціль hover/click-тригера саме на сторінці pageId: якщо для цієї сторінки є
  // власний запис у *TargetByPage (навіть null) — використовуємо його, інакше
  // падаємо назад на старе "глобальне" значення showOnHoverId/showOnClickId.
  // Так та сама кнопка може на одній сторінці показувати один об'єкт, на іншій —
  // інший, а на третій — нічого не викликати взагалі.
  const getHoverTargetId = (el: CanvasElement, pageId: string): number | null => {
    if (el.hoverTargetByPage && pageId in el.hoverTargetByPage) return el.hoverTargetByPage[pageId];
    return el.showOnHoverId ?? null;
  };
  const getClickTargetId = (el: CanvasElement, pageId: string): number | null => {
    if (el.clickTargetByPage && pageId in el.clickTargetByPage) return el.clickTargetByPage[pageId];
    return el.showOnClickId ?? null;
  };

  // Абсолютна позиція елемента в системі координат полотна (для лінії
  // зв'язку) — x/y елемента зберігаються відносно БАТЬКА (renderCanvasNode
  // рендерить дочірні елементи вкладено), тож для елемента всередині блоку
  // треба пройти весь ланцюжок parentId і підсумувати x/y кожного предка.
  // Не працює коректно для рядків списку (stackedRows/columns) — вони
  // рендеряться в потоці (flex), а не через власний x/y, тож лінія до
  // окремого рядка списку поки не підтримується.
  const getAbsolutePosition = (id: number): { x: number; y: number; width: number; height: number } | null => {
    const el = elements.find((item) => item.id === id);
    if (!el) return null;
    let x = el.x;
    let y = el.y;
    let parentId = el.parentId;
    while (parentId !== null) {
      const parent = elements.find((item) => item.id === parentId);
      if (!parent) break;
      x += parent.x;
      y += parent.y;
      parentId = parent.parentId;
    }
    return { x, y, width: el.width, height: el.height };
  };

  const getMinDimensions = (parentId: number) => {
    // "Список" сам шикує дітей вертикально (не вільне позиціонування) —
    // x/y дочірніх елементів для нього нічого не означають, тому рахувати
    // мінімум за їхніми координатами тут не можна.
    const parentEl = elements.find((e) => e.id === parentId);
    if (parentEl?.type === "list") {
      return { minWidth: 1, minHeight: 1 };
    }

    const children = elements.filter((el) => el.parentId === parentId && isVisibleOnPage(el, currentPageId));
    if (children.length === 0) {
      return { minWidth: 1, minHeight: 1 };
    }

    let maxRight = 0;
    let maxBottom = 0;

    children.forEach((child) => {
      const right = child.x + child.width;
      const bottom = child.y + child.height;
      if (right > maxRight) maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    });

    return {
      minWidth: Math.max(1, maxRight),
      minHeight: Math.max(1, maxBottom),
    };
  };

  const boxesOverlap = (
    x: number,
    y: number,
    width: number,
    height: number,
    sib: CanvasElement,
    minGap: number
  ): boolean => {
    const sx1 = sib.x - minGap;
    const sy1 = sib.y - minGap;
    const sx2 = sib.x + sib.width + minGap;
    const sy2 = sib.y + sib.height + minGap;
    return x < sx2 && x + width > sx1 && y < sy2 && y + height > sy1;
  };

  // Шукає вільне від сусідів місце для нового елемента (width×height) у межах
  // батьківського поля parentId (чи умовного простору полотна, якщо parentId
  // null) — скановує кандидатів зліва направо, зверху вниз, крок 10px, і бере
  // перший, що не перекриває жодного видимого на поточній сторінці сестринського
  // елемента (з тим самим minGap=1px, що й pushOutOfOverlap). Якщо вільного
  // місця в межах батька не лишилось — падає назад на продовження рядка праворуч
  // від останнього сусіда (стара поведінка), щоб елемент завжди десь з'явився.
  const findFreePosition = (parentId: number | null, width: number, height: number): { x: number; y: number } => {
    const siblings = elements.filter((el) => el.parentId === parentId && isVisibleOnPage(el, currentPageId));
    const gap = 8;
    const minGap = 1;

    if (siblings.length === 0) return { x: 1, y: 1 };

    const parentEl = parentId !== null ? elements.find((e) => e.id === parentId) : null;
    const boundsWidth = parentEl ? Math.max(parentEl.width - 2, width) : 1900;
    const boundsHeight = parentEl ? Math.max(parentEl.height - 2, height) : 1000;

    const step = 10;
    for (let y = 1; y + height <= boundsHeight; y += step) {
      for (let x = 1; x + width <= boundsWidth; x += step) {
        const overlaps = siblings.some((sib) => boxesOverlap(x, y, width, height, sib, minGap));
        if (!overlaps) return { x, y };
      }
    }

    // Вільного місця в межах батька не знайшлось — продовжуємо рядок праворуч.
    const startX = Math.max(...siblings.map((s) => s.x + s.width)) + gap;
    return { x: startX, y: 1 };
  };

  // М'яке підштовхування: рух під час drag/resize тепер повністю вільний (без
  // блокування по шляху), а це викликається лише ОДИН раз — коли мишу відпустили.
  // Перевіряє лише кінцеву позицію; якщо вона з кимось перекривається ближче ніж
  // на minGap — відсуває по осі найменшого проникнення, щоб мінімальний відступ
  // 1px гарантовано лишався в результаті, навіть якщо сам рух ніхто не блокував.
  const pushOutOfOverlap = (
    x: number,
    y: number,
    width: number,
    height: number,
    siblings: CanvasElement[],
    minGap: number
  ) => {
    let resultX = x;
    let resultY = y;

    siblings.forEach((sib) => {
      if (!boxesOverlap(resultX, resultY, width, height, sib, minGap)) return;

      const sx1 = sib.x - minGap;
      const sy1 = sib.y - minGap;
      const sx2 = sib.x + sib.width + minGap;
      const sy2 = sib.y + sib.height + minGap;

      const pushLeft = resultX + width - sx1;
      const pushRight = sx2 - resultX;
      const pushUp = resultY + height - sy1;
      const pushDown = sy2 - resultY;
      const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);

      if (minPush === pushLeft) resultX -= pushLeft;
      else if (minPush === pushRight) resultX += pushRight;
      else if (minPush === pushUp) resultY -= pushUp;
      else resultY += pushDown;
    });

    return { x: Math.round(resultX), y: Math.round(resultY) };
  };

  // Те саме, що resolveCollision, але для зміни розміру: тут "рухається" не лише
  // позиція, а й ширина/висота одночасно (ручка resize може зсувати x/y — напр. ліва
  // чи верхня грань). Лінійно інтерполюємо весь бокс {x,y,width,height} від останнього
  // валідного стану (from) до запропонованого (to) і бінарним пошуком знаходимо
  // найбільшу частку шляху (t), на якій ще немає перетину із сусідами.
  const resolveResizeCollision = (
    from: { x: number; y: number; width: number; height: number },
    to: { x: number; y: number; width: number; height: number },
    siblings: CanvasElement[],
    minGap: number
  ) => {
    if (siblings.length === 0) return to;

    const collidesAt = (t: number) => {
      const bx = from.x + (to.x - from.x) * t;
      const by = from.y + (to.y - from.y) * t;
      const bw = from.width + (to.width - from.width) * t;
      const bh = from.height + (to.height - from.height) * t;
      return siblings.some((sib) => boxesOverlap(bx, by, bw, bh, sib, minGap));
    };

    if (!collidesAt(1)) return to;
    if (collidesAt(0)) return from;

    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (collidesAt(mid)) hi = mid;
      else lo = mid;
    }

    return {
      x: Math.round(from.x + (to.x - from.x) * lo),
      y: Math.round(from.y + (to.y - from.y) * lo),
      width: Math.round(from.width + (to.width - from.width) * lo),
      height: Math.round(from.height + (to.height - from.height) * lo),
    };
  };

  const handleExportJSON = () => {
    const exportData = {
      pages,
      elements,
      panelPos,
      panelSize,
      panelOpacity,
      toolsPanelCollapsed,
      refsPanelPos,
      refsPanelSize,
      refsPanelOpacity,
      refsPanelCollapsed,
      libraryItems,
      connections,
      customComplexObjects,
      selectedHospital,
      openParamSections: Array.from(openParamSections),
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `canvas-multipage-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportHTML = () => {
    const renderElementHTML = (el: CanvasElement): string => {
      const children = elements.filter((child) => child.parentId === el.id);
      const computedBgColor = applyBgOpacity(getElementColor(el), el.bgOpacity);
      const isBtn = el.type === "button";

      const style = `
        position: absolute;
        left: ${el.x}px;
        top: ${el.y}px;
        width: ${el.width}px;
        height: ${el.height}px;
        background-color: ${el.meshBg ? "#f0ece8" : computedBgColor};
        color: ${el.textColor || "#ffffff"};
        padding: ${el.padding || 0}px;
        border-radius: ${isBtn ? (el.borderRadius ?? 8) : 0}px;
        font-size: ${el.fontSize || 12}px;
        font-family: ${el.fontFamily || "inherit"};
        font-weight: ${el.fontWeight || "500"};
        text-align: ${el.textAlign || "left"};
        ${el.lineHeight != null ? `line-height: ${el.lineHeight};` : ""}
        box-sizing: border-box;
      `;

      let contentHTML = "";
      let innerChildrenHTML = "";

      if (el.type === "button") {
        contentHTML = `<button style="width:100%;height:100%;border:none;background:transparent;color:inherit;font:inherit;cursor:pointer;" ${
          el.targetPageId ? `onclick="switchPage('${el.targetPageId}')"` : ""
        }>${el.content}</button>`;
        innerChildrenHTML = children.map((c) => renderElementHTML(c)).join("");
      } else if (el.type === "heading") {
        contentHTML = `<h2 style="margin:0;font-size:inherit;">${el.content}</h2>`;
        innerChildrenHTML = children.map((c) => renderElementHTML(c)).join("");
      } else if (el.type === "list") {
        // "Список" сам шикує дітей вертикально зі скролом — на відміну від
        // інших типів, тут діти НЕ рендеряться через звичайний
        // position:absolute (їхні x/y для списку не мають сенсу). Якщо задані
        // стовпці (el.columns) — кожен рядок ділиться на комірки-стовпці.
        const hasColumns = el.columns && el.columns.length > 0;
        const headerHTML = hasColumns
          ? `<div style="display:flex;gap:8px;padding-bottom:4px;border-bottom:1px solid rgba(0,0,0,0.15);">${el.columns!
              .map(
                (col) =>
                  `<span style="flex-grow:${col.width ?? 1};flex-basis:0;min-width:0;font-size:10px;font-weight:700;text-transform:uppercase;opacity:.7;">${col.label}</span>`
              )
              .join("")}</div>`
          : "";
        const itemsHTML = children
          .map((c) => {
            const rowContent = hasColumns
              ? el.columns!
                  .map(
                    (col) =>
                      `<span style="flex-grow:${col.width ?? 1};flex-basis:0;min-width:0;">${(c.columnValues && c.columnValues[col.id]) || ""}</span>`
                  )
                  .join("")
              : c.content;
            return `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid rgba(0,0,0,0.1);color:${c.textColor || "#000000"};background-color:${c.customBgColor || "transparent"};font-size:${c.fontSize || 12}px;font-family:${c.fontFamily || "inherit"};font-weight:${c.fontWeight || "500"};">${rowContent}</div>
        `;
          })
          .join("");
        contentHTML = `
          <div style="display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;">
            ${el.content ? `<div style="flex-shrink:0;font-weight:600;text-transform:uppercase;padding-bottom:4px;">${el.content}</div>` : ""}
            ${headerHTML}
            <div style="flex:1;min-height:0;overflow-y:auto;">${itemsHTML}</div>
          </div>
        `;
      } else if (el.type === "clock") {
        // Живий час у статичному HTML-експорті — тікає через скрипт
        // updateClocks() унизу сторінки, а не через React-стан.
        contentHTML = `
          <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4px;box-sizing:border-box;">
            <div class="constructor-clock-time" style="font-weight:700;font-size:${(el.fontSize || 12) * 1.7}px;"></div>
            <div class="constructor-clock-date" style="opacity:.8;text-transform:capitalize;font-size:${el.fontSize || 12}px;"></div>
          </div>
        `;
      } else if (el.type === "image") {
        contentHTML = el.imageUrl
          ? `<img src="${el.imageUrl}" alt="${el.content}" style="width:100%;height:100%;object-fit:contain;display:block;" />`
          : "";
      } else {
        contentHTML = `<div>${el.content}</div>`;
        innerChildrenHTML = children.map((c) => renderElementHTML(c)).join("");
      }

      const meshHTML = el.meshBg
        ? renderMeshLayerHTML(el.meshSpeed, el.meshIntensity, el.meshColors, -1)
        : "";

      return `
        <div id="el-${el.id}" style="${style}">
          ${meshHTML}
          ${contentHTML}
          ${innerChildrenHTML}
        </div>
      `;
    };

    const pagesHTML = pages
      .map((p) => {
        const topElements = elements.filter(
          (el) => el.parentId === null && isVisibleOnPage(el, p.id)
        );
        const pageMeshHTML = p.meshBackground
          ? renderMeshLayerHTML(p.meshSpeed, p.meshIntensity, p.meshColors)
          : "";
        return `
        <div id="page-${p.id}" class="page-container" style="display: ${p.id === currentPageId ? "block" : "none"}; position: relative; width: 100%; min-height: 800px; background: ${p.meshBackground ? "#f0ece8" : "#ffffff"};">
          ${pageMeshHTML}
          ${topElements.map((el) => renderElementHTML(el)).join("")}
        </div>
      `;
      })
      .join("");

    const fullHTML = `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Сгенерована сторінка</title>
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300&subset=cyrillic&display=swap" rel="stylesheet">
        <style>
          @font-face {
            font-family: 'ITFLight';
            src: url('/ITFDevanagari-Light.ttf') format('truetype');
            font-display: block;
          }
          :root {
            --font-itf-light: 'ITFLight';
            --font-cormorant: 'Cormorant Garamond';
          }
          body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; }
          .page-container { position: relative; max-width: 1200px; margin: 0 auto; background: #ffffff; min-height: 100vh; }

          .ctor-mesh-bg, .ctor-mesh-bg2 {
            position: absolute; inset: -10%; z-index: 0; pointer-events: none;
            filter: blur(40px); will-change: transform;
          }
          .ctor-mesh-bg {
            background:
              radial-gradient(40% 45% at 30% 80%, rgba(214,150,150,0.45), transparent 70%),
              radial-gradient(38% 42% at 70% 75%, rgba(150,190,180,0.40), transparent 70%),
              radial-gradient(45% 50% at 80% 25%, rgba(200,180,210,0.35), transparent 70%),
              radial-gradient(40% 45% at 15% 30%, rgba(180,200,205,0.35), transparent 70%),
              radial-gradient(50% 55% at 50% 55%, rgba(230,200,185,0.40), transparent 75%);
            animation: ctor-meshmove 18s ease-in-out infinite alternate;
          }
          .ctor-mesh-bg2 {
            background:
              radial-gradient(42% 48% at 60% 30%, rgba(214,150,150,0.38), transparent 70%),
              radial-gradient(40% 45% at 25% 65%, rgba(150,190,180,0.36), transparent 70%),
              radial-gradient(46% 52% at 85% 70%, rgba(200,180,210,0.32), transparent 72%),
              radial-gradient(44% 50% at 40% 85%, rgba(230,200,185,0.36), transparent 75%);
            animation: ctor-meshmove2 26s ease-in-out infinite alternate;
            mix-blend-mode: soft-light; opacity: 0.9;
          }
          @keyframes ctor-meshmove {
            0%   { transform: translate(-4%, -3%) scale(1.05) rotate(0deg); }
            50%  { transform: translate(4%, 3%)   scale(1.12) rotate(4deg); }
            100% { transform: translate(-2%, 4%)  scale(1.06) rotate(-3deg); }
          }
          @keyframes ctor-meshmove2 {
            0%   { transform: translate(3%, 4%)   scale(1.08) rotate(0deg); }
            50%  { transform: translate(-4%, -3%) scale(1.0)  rotate(-5deg); }
            100% { transform: translate(4%, -4%)  scale(1.1)  rotate(3deg); }
          }
        </style>
      </head>
      <body>
        ${pagesHTML}
        <script>
          function switchPage(pageId) {
            document.querySelectorAll('.page-container').forEach(el => el.style.display = 'none');
            const target = document.getElementById('page-' + pageId);
            if(target) target.style.display = 'block';
          }

          function updateClocks() {
            const now = new Date();
            const time = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const date = now.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            document.querySelectorAll('.constructor-clock-time').forEach(el => el.textContent = time);
            document.querySelectorAll('.constructor-clock-date').forEach(el => el.textContent = date);
          }
          updateClocks();
          setInterval(updateClocks, 1000);
        </script>
      </body>
      </html>
    `;

    const blob = new Blob([fullHTML], { type: "text/html" });
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = URL.createObjectURL(blob);
    downloadAnchor.download = `exported-site-${Date.now()}.html`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.readAsText(file, "UTF-8");
    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.pages && parsed.elements) {
          const importedConnections: ElementConnection[] = Array.isArray(parsed.connections) ? parsed.connections : [];
          setPages(parsed.pages);
          setElements(parsed.elements);
          setConnections(importedConnections);
          saveToHistory(parsed.pages, parsed.elements, importedConnections);
          setCurrentPageId(parsed.pages[0]?.id || "home");
          setSelectedIds([]);
          if (parsed.panelPos) setPanelPos(clampPanelPos(parsed.panelPos));
          if (parsed.panelSize) setPanelSize(parsed.panelSize);
          if (typeof parsed.panelOpacity === "number") setPanelOpacity(parsed.panelOpacity);
          if (typeof parsed.toolsPanelCollapsed === "boolean") setToolsPanelCollapsed(parsed.toolsPanelCollapsed);
          if (parsed.refsPanelPos) setRefsPanelPos(clampPanelPos(parsed.refsPanelPos));
          if (parsed.refsPanelSize) setRefsPanelSize(parsed.refsPanelSize);
          if (typeof parsed.refsPanelOpacity === "number") setRefsPanelOpacity(parsed.refsPanelOpacity);
          if (typeof parsed.refsPanelCollapsed === "boolean") setRefsPanelCollapsed(parsed.refsPanelCollapsed);
          if (Array.isArray(parsed.libraryItems)) setLibraryItems(parsed.libraryItems);
          if (Array.isArray(parsed.customComplexObjects)) setCustomComplexObjects(parsed.customComplexObjects);
          if (parsed.selectedHospital) setSelectedHospital(parsed.selectedHospital);
          if (Array.isArray(parsed.openParamSections)) setOpenParamSections(new Set(parsed.openParamSections));
        } else if (Array.isArray(parsed)) {
          setElements(parsed);
          saveToHistory(pages, parsed, []);
          setConnections([]);
          setSelectedIds([]);
        } else {
          alert("Невірний формат JSON!");
        }
      } catch (err) {
        alert("Помилка читання JSON файлу");
      }
    };
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Тягне канонічний список відділень з Supabase (схема lpz, /api/departments)
  // і створює з нього елемент "Список" зі стовпцями — по одному рядку на
  // відділення АКТИВНОЇ лікарні (org_edrpou з selectedHospital) — кнопка й
  // так задизейблена в хедері, доки лікарню не обрано (див. гейт).
  const handleImportDepartments = async () => {
    try {
      const res = await fetch(`/api/departments?org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      if (!res.ok || !data.departments) {
        alert(`Помилка завантаження відділень: ${data.error || res.statusText}`);
        return;
      }

      type Department = {
        structure_id: string;
        org_edrpou: string;
        name: string;
        type_code: string | null;
        direction: string | null;
        block: string | null;
        beds: number | null;
      };
      const departments: Department[] = data.departments;

      const columns: ListColumn[] = [
        { id: "org", label: "ЛПЗ", width: 1 },
        { id: "name", label: "Відділення", width: 3 },
        { id: "direction", label: "Напрямок", width: 1.5 },
        { id: "beds", label: "Ліжка", width: 1 },
      ];

      const listId = Date.now();
      const cardWidth = 640;
      const cardHeight = 420;
      const freePos = findFreePosition(forcedParentId, cardWidth, cardHeight);
      const listElement: CanvasElement = {
        id: listId,
        pageId: currentPageId,
        isGlobal: false,
        isTriggerTarget: false,
        showOnHoverId: null,
        showOnClickId: null,
        type: "list",
        content: "Відділення (Supabase, схема lpz)",
        width: cardWidth,
        height: cardHeight,
        x: freePos.x,
        y: freePos.y,
        textColor: "#ffffff",
        padding: 8,
        borderRadius: 0,
        fontSize: 12,
        fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
        fontWeight: "500",
        textAlign: "left",
        parentId: forcedParentId,
        targetPageId: null,
        columns,
      };

      const rowElements: CanvasElement[] = departments.map((dept, i) => ({
        id: listId + 1 + i,
        pageId: currentPageId,
        isGlobal: false,
        isTriggerTarget: false,
        showOnHoverId: null,
        showOnClickId: null,
        type: "text",
        content: dept.name,
        width: 120,
        height: 30,
        x: 1,
        y: 1,
        textColor: "#000000",
        padding: 4,
        borderRadius: 0,
        fontSize: 13,
        fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
        fontWeight: "500",
        textAlign: "left",
        parentId: listId,
        targetPageId: null,
        columnValues: {
          org: dept.org_edrpou,
          name: dept.name,
          direction: dept.direction || "—",
          beds: dept.beds != null ? String(dept.beds) : "—",
        },
      }));

      updateElementsAndHistory([...elements, listElement, ...rowElements]);
      handleSelectElement(listId);
    } catch (err) {
      alert("Не вдалося завантажити відділення — перевір, чи запущений сервер і чи налаштований Supabase.");
    }
  };

  const getElementDepth = (id: number): number => {
    let depth = 0;
    let current = elements.find((el) => el.id === id);
    while (current && current.parentId !== null) {
      depth++;
      current = elements.find((el) => el.id === current?.parentId);
    }
    return depth;
  };

  const getElementColor = (el: CanvasElement): string => {
    if (el.customBgColor) return el.customBgColor;
    const depth = getElementDepth(el.id);
    return LEVEL_COLORS[depth % LEVEL_COLORS.length];
  };

  // Перетворює hex-колір фону елемента в rgba() з урахуванням його bgOpacity,
  // щоб прозорість застосовувалась лише до фону, а не до тексту/дочірніх елементів.
  const applyBgOpacity = (hexColor: string, opacity: number | undefined): string => {
    if (opacity === undefined || opacity >= 1) return hexColor;
    const hex = hexColor.replace("#", "");
    const bigint = parseInt(
      hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex,
      16
    );
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, opacity)})`;
  };

  const selectedElements = elements.filter((el) => selectedIds.includes(el.id));
  const singleSelected = selectedElements.length === 1 ? selectedElements[0] : null;
  // Перший з виділених — лише для ВІДОБРАЖЕННЯ поточного значення в
  // контролах, що можна застосовувати масово (кілька виділених елементів
  // одразу). updateSelectedFields вже й так пише в УСІ selectedIds, тож
  // масове редагування — це питання лише того, чи показувати контрол,
  // коли singleSelected === null (виділено більше одного).
  const bulkSelected = selectedElements.length > 0 ? selectedElements[0] : null;

  // Зворотний зв'язок: клік на будь-яку кнопку на полотні (навіть створену
  // задовго до появи панелі "Складні об'єкти" — не лише через неї) відкриває
  // в цій панелі налаштування пігулки з РЕАЛЬНИМИ значеннями обраної кнопки,
  // готовими редагувати напряму (isEditingExistingButton нижче).
  useEffect(() => {
    if (singleSelected?.type === "button") {
      setSelectedComplexObjectId("pill");
    }
  }, [singleSelected?.id, singleSelected?.type]);

  // Вибір елемента (на полотні чи в дереві) одразу перемикає плаваючу панель
  // управління на вкладку "Параметри" — не треба вручну шукати її серед
  // "Створити"/"Сторінка", коли щойно клікнули на об'єкт.
  useEffect(() => {
    if (selectedIds.length > 0) setActivePanelTab("params");
  }, [selectedIds]);

  const handleSelectElement = (id: number | null, isMultiKey = false) => {
    if (id === null) {
      setSelectedIds([]);
      setForcedParentId(null);
      return;
    }

    if (isMultiKey) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
      const el = elements.find((item) => item.id === id);
      if (el && (el.type === "block" || el.type === "list")) {
        setForcedParentId(id);
      }
    }
  };

  const handleButtonClick = (e: React.MouseEvent, el: CanvasElement) => {
    e.stopPropagation();

    // Режим з'єднання (панель "🔗 Зв'язки") "з'їдає" клік — замість
    // звичайного виділення/toggle перший клік позначає елемент джерелом,
    // другий (по ІНШОМУ елементу) створює зв'язок. Повторний клік по
    // самому джерелу скасовує вибір.
    if (linkMode) {
      if (pendingLinkSourceId === null) {
        setPendingLinkSourceId(el.id);
      } else if (pendingLinkSourceId === el.id) {
        setPendingLinkSourceId(null);
      } else {
        const newConnection: ElementConnection = {
          id: `link-${Date.now()}`,
          fromId: pendingLinkSourceId,
          toId: el.id,
        };
        updateConnectionsAndHistory([...connections, newConnection]);
        setPendingLinkSourceId(null);
      }
      return;
    }

    handleSelectElement(el.id, e.shiftKey || e.ctrlKey || e.metaKey);
    runConnectionActions(el.id);

    const clickTargetId = getClickTargetId(el, currentPageId);
    if (clickTargetId) {
      setClickedElementId((prev) => (prev === clickTargetId ? null : clickTargetId));
    }

    if (el.type === "button") {
      if (el.targetPageId) {
        setCurrentPageId(el.targetPageId);
        setSelectedIds([]);
      }

      if (el.isToggle) {
        const nextElements = elements.map((item) => {
          if (item.id === el.id) {
            // У груповому режимі клік завжди активує саме цю кнопку (як
            // пігулка року — не можна клікнути й зняти активність із усіх).
            return { ...item, isPressed: el.groupExclusive ? true : !item.isPressed };
          }
          // Сестри в тому самому блоці з groupExclusive=true втрачають
          // активність — лише одна пігулка в групі активна одночасно.
          if (el.groupExclusive && item.groupExclusive && item.parentId === el.parentId) {
            return { ...item, isPressed: false };
          }
          return item;
        });
        updateElementsAndHistory(nextElements);
      }

      // Пігулка-фільтр КПІ (kpiGroupId) — тягне свіжі дані й живцем оновлює
      // текстові поля значень з тим самим kpiGroupId. Функціональний
      // setElements навмисно, а не nextElements/updateElementsAndHistory
      // вище: fetch асинхронний, і на момент відповіді state вже міг
      // змінитись (напр. від toggle-оновлення isPressed щойно вище).
      if (el.kpiGroupId) {
        void handleKpiPillClick(el.kpiGroupId, el.kpiYear ?? null);
      }
    }
  };

  const handleKpiPillClick = async (groupId: string, year: number | null) => {
    try {
      const orgParam = `org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`;
      const url = year ? `/api/hospital-summary?year=${year}&${orgParam}` : `/api/hospital-summary?${orgParam}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.summary) return;
      const summary = data.summary as Record<string, number>;
      setElements((prev) => {
        const next = prev.map((item) =>
          item.kpiGroupId === groupId && item.kpiField
            ? {
                ...item,
                content:
                  item.kpiField === "death_rate_pct"
                    ? `${summary[item.kpiField] ?? "—"}%`
                    : String(summary[item.kpiField] ?? "—"),
              }
            : item
        );
        saveToHistory(pages, next);
        return next;
      });
    } catch {
      // мовчки ігноруємо — пігулка просто не оновить значення цього разу
    }
  };

  const handleAddElement = (e: React.FormEvent) => {
    e.preventDefault();
    const isButton = newType === "button";
    const isClock = newType === "clock";
    const isImage = newType === "image";
    const width = isButton ? 120 : isClock ? 220 : isImage ? 100 : forcedParentId ? 120 : 240;
    const height = isButton ? 40 : isClock ? 70 : isImage ? 100 : forcedParentId ? 60 : 140;
    const count = Math.max(1, Math.min(50, newCount || 1));
    const gap = 8; // відступ між елементами, коли створюємо кілька в ряд

    // Перший елемент — у вільне від сусідів місце в межах батьківського поля
    // (findFreePosition), а не завжди в лівий верхній кут — інакше кожне
    // повторне створення накладалось би на вже існуючі елементи. Решта (якщо
    // count > 1) шикуються рядком праворуч від нього, як і раніше.
    const freePos = findFreePosition(forcedParentId, width, height);

    const newElements: CanvasElement[] = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      pageId: currentPageId,
      isGlobal: false,
      isTriggerTarget: false,
      showOnHoverId: null,
      showOnClickId: null,
      type: newType,
      content: count > 1 ? `${newContent} ${i + 1}` : newContent,
      width,
      height,
      x: freePos.x + i * (width + gap),
      y: freePos.y,
      textColor: "#ffffff",
      padding: isButton ? 4 : 8,
      borderRadius: isButton ? 8 : 0,
      fontSize: newType === "heading" ? 16 : 12,
      fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
      fontWeight: "500",
      textAlign: "left",
      parentId: forcedParentId,
      targetPageId: null,
      hoverContent: "",
      hoverBgColor: isButton ? "#1d4ed8" : "",
      hoverTextColor: isButton ? "#ffffff" : "",
      glowColor: "#3b82f6",
      glowBlur: 8,
      activeContent: "",
      activeBgColor: isButton ? "#1e40af" : "",
      activeTextColor: isButton ? "#ffffff" : "",
      activeScale: isButton ? 0.96 : 1,
      activeOffsetY: isButton ? 1 : 0,
      activeGlowColor: "#60a5fa",
      activeGlowBlur: 14,
      activeWidthOffset: 0,
      activeHeightOffset: 0,
      isToggle: false,
      isPressed: false,
    }));

    const nextElements = [...elements, ...newElements];
    updateElementsAndHistory(nextElements);
    setSelectedIds(newElements.map((el) => el.id));
  };

  // Спільні поля кнопки, ще не зачеплені жодним пресетом — розумні
  // "нульові" значення, поверх яких handleAddComplexObject накладає
  // template.defaults + complexObjectDraft (і, для груп, власний x/width на
  // кожен елемент).
  const buildComplexObjectBase = (id: number, content: string): CanvasElement => ({
    id,
    pageId: currentPageId,
    isGlobal: false,
    isTriggerTarget: false,
    showOnHoverId: null,
    showOnClickId: null,
    type: "button",
    content,
    width: 60,
    height: 30,
    x: 0,
    y: 0,
    textColor: "#ffffff",
    padding: 4,
    borderRadius: 8,
    fontSize: 12,
    fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
    fontWeight: "500",
    textAlign: "left",
    parentId: forcedParentId,
    targetPageId: null,
    hoverContent: "",
    activeContent: "",
    activeScale: 1,
    activeOffsetY: 0,
    activeGlowColor: "#60a5fa",
    activeGlowBlur: 14,
    activeWidthOffset: 0,
    activeHeightOffset: 0,
    isToggle: false,
    isPressed: false,
  });

  // Створює елемент(и) з обраного пресету "складного об'єкта" (панель
  // "Складні об'єкти") — базові поля кнопки + defaults пресету + те, що
  // донастроєно в complexObjectDraft (підсвітка/кольори/розміри тощо).
  // Пресети з groupItems (напр. "Блок пігулок (місяці)") створюють одразу
  // весь ряд кнопок — по одній на кожен рядок groupItems, тим самим стилем,
  // але кожна зі своєю шириною під довжину власного тексту.
  const handleAddComplexObject = () => {
    const template = COMPLEX_OBJECTS.find((t) => t.id === selectedComplexObjectId);
    if (!template) return;

    if (template.groupItems && template.groupItems.length > 0) {
      const gap = 8;
      const height =
        (complexObjectDraft.height as number) ?? (template.defaults.height as number) ?? 30;
      // Авто-ширина під довжину тексту (як .ypill-month: padding 0 14px
      // навколо тексту), а не однакова фіксована ширина для всіх пігулок.
      const itemWidths = template.groupItems.map((label) =>
        Math.max(60, Math.round(label.length * 9 + 32))
      );
      const totalWidth = itemWidths.reduce((sum, w) => sum + w, 0) + gap * (itemWidths.length - 1);
      const freePos = findFreePosition(forcedParentId, totalWidth, height);

      let cursorX = freePos.x;
      const newElements: CanvasElement[] = template.groupItems.map((label, i) => {
        const width = itemWidths[i];
        const base = buildComplexObjectBase(Date.now() + i, label);
        const el: CanvasElement = {
          ...base,
          ...template.defaults,
          ...complexObjectDraft,
          id: base.id,
          content: label,
          width,
          height,
          x: cursorX,
          y: freePos.y,
        };
        cursorX += width + gap;
        return el;
      });

      updateElementsAndHistory([...elements, ...newElements]);
      setSelectedIds(newElements.map((el) => el.id));
      return;
    }

    const width = (complexObjectDraft.width as number) ?? (template.defaults.width as number) ?? 60;
    const height = (complexObjectDraft.height as number) ?? (template.defaults.height as number) ?? 30;
    const freePos = findFreePosition(forcedParentId, width, height);

    const base = buildComplexObjectBase(Date.now(), template.label.replace(/^\S+\s*/, ""));
    const newElement: CanvasElement = {
      ...base,
      ...template.defaults,
      ...complexObjectDraft,
      id: base.id,
      x: freePos.x,
      y: freePos.y,
    };

    // Дочірні елементи пресету (напр. число + підпис картки КПІ) — власна
    // позиція/розмір/стиль з template.children, parentId прив'язаний на
    // щойно створеного батька.
    const childElements: CanvasElement[] = (template.children ?? []).map((child, i) => {
      const childBase = buildComplexObjectBase(newElement.id + 1 + i, child.content);
      return {
        ...childBase,
        ...child.defaults,
        id: childBase.id,
        parentId: newElement.id,
        content: child.content,
        x: child.x,
        y: child.y,
        width: child.width,
        height: child.height,
      };
    });

    updateElementsAndHistory([...elements, newElement, ...childElements]);
    handleSelectElement(newElement.id);
  };

  // "КПІ лікарні (реальні дані)" — одна кнопка одразу ставить на полотно ДВА
  // пов'язаних об'єкти: ряд пігулок-років (стиль 1:1 з "Пігулка"/"Блок
  // пігулок (місяці)", groupExclusive) і ряд плиток "Картка КПІ" під ними.
  // Рік більше НЕ обирається в цій панелі — обирається кліком по пігулці на
  // полотні (kpiGroupId зв'язує пігулку з плитками, kpiYear/kpiField —
  // handleKpiPillClick вище). Початково завантажується "Весь час". Тягне
  // /api/hospital-summary?year=… (service_role, RPC public.lpz_hospital_summary
  // — рахує напряму з lpz.lpz_hospitalizations, той самий підхід, що й
  // lpz_department_stats) — на відміну від старого v_hospital_summary, тут
  // death_rate_pct/avg_age РЕАЛЬНІ (не завжди null).
  const HOSPITAL_KPI_MIN_YEAR = 2020;
  const hospitalKpiYearOptions = Array.from(
    { length: new Date().getFullYear() - HOSPITAL_KPI_MIN_YEAR + 1 },
    (_, i) => HOSPITAL_KPI_MIN_YEAR + i
  );
  const [hospitalKpiLoading, setHospitalKpiLoading] = useState(false);
  const [hospitalKpiError, setHospitalKpiError] = useState<string | null>(null);

  const formatKpiFieldValue = (
    field: NonNullable<CanvasElement["kpiField"]>,
    summary: Record<string, number>
  ) => (field === "death_rate_pct" ? `${summary[field] ?? "—"}%` : String(summary[field] ?? "—"));

  const handleLoadHospitalKpi = async () => {
    setHospitalKpiLoading(true);
    setHospitalKpiError(null);
    try {
      const res = await fetch(`/api/hospital-summary?org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      if (!res.ok || !data.summary) {
        setHospitalKpiError(data.error || "Помилка завантаження");
        return;
      }
      const summary = data.summary as Record<string, number>;
      const kpiGroupId = `kpi-${Date.now()}`;

      const tileGap = 24;
      const tileWidth = 200;
      const tileHeight = 70;
      const tilesTotalWidth =
        tileWidth * HOSPITAL_KPI_FIELDS.length + tileGap * (HOSPITAL_KPI_FIELDS.length - 1);

      const pillGap = 8;
      const pillHeight = 30;
      const pillLabels = ["ВЕСЬ ЧАС", ...hospitalKpiYearOptions.map(String)];
      const pillWidths = pillLabels.map((label) => Math.max(60, Math.round(label.length * 9 + 32)));
      const pillsTotalWidth = pillWidths.reduce((sum, w) => sum + w, 0) + pillGap * (pillWidths.length - 1);

      const totalWidth = Math.max(tilesTotalWidth, pillsTotalWidth);
      const rowGap = 12;
      const totalHeight = pillHeight + rowGap + tileHeight;
      const freePos = findFreePosition(forcedParentId, totalWidth, totalHeight);

      const newElements: CanvasElement[] = [];
      const selectedIdsNext: number[] = [];

      let pillX = freePos.x;
      pillLabels.forEach((label, i) => {
        const width = pillWidths[i];
        const year = i === 0 ? null : hospitalKpiYearOptions[i - 1];
        const id = Date.now() + 1000 + i;
        newElements.push({
          ...buildComplexObjectBase(id, label),
          ...PILL_STYLE_DEFAULTS,
          width,
          height: pillHeight,
          x: pillX,
          y: freePos.y,
          content: label,
          kpiGroupId,
          kpiYear: year,
          isPressed: year === null,
        });
        pillX += width + pillGap;
        selectedIdsNext.push(id);
      });

      const tileY = freePos.y + pillHeight + rowGap;
      HOSPITAL_KPI_FIELDS.forEach((tile, i) => {
        const parentId = Date.now() + 2000 + i * 10;
        const x = freePos.x + i * (tileWidth + tileGap);
        newElements.push({
          ...buildComplexObjectBase(parentId, ""),
          type: "block",
          width: tileWidth,
          height: tileHeight,
          x,
          y: tileY,
          customBgColor: "#ffffff",
          bgOpacity: 0,
          padding: 0,
          borderRadius: 0,
        });
        newElements.push({
          ...buildComplexObjectBase(parentId + 1, formatKpiFieldValue(tile.field, summary)),
          type: "text",
          width: tileWidth,
          height: 44,
          x: 0,
          y: 0,
          parentId,
          fontSize: 36,
          fontWeight: "300",
          textColor: "#1a1a1a",
          textAlign: "right",
          bgOpacity: 0,
          padding: 0,
          kpiGroupId,
          kpiField: tile.field,
        });
        newElements.push({
          ...buildComplexObjectBase(parentId + 2, tile.label),
          type: "text",
          width: tileWidth,
          height: 26,
          x: 0,
          y: 44,
          parentId,
          fontSize: 20,
          fontWeight: "300",
          textColor: "#9a958f",
          textAlign: "right",
          bgOpacity: 0,
          padding: 0,
        });
        selectedIdsNext.push(parentId);
      });

      updateElementsAndHistory([...elements, ...newElements]);
      setSelectedIds(selectedIdsNext);
    } catch {
      setHospitalKpiError("Не вдалося звернутись до сервера");
    } finally {
      setHospitalKpiLoading(false);
    }
  };

  // Спільний рендерер для "кубів" показників (ієрархія/повторні
  // госпіталізації/діагнози/демографія/часові патерни) — усі повертають
  // масив рядків з однаковими за духом полями (лічильники + group_key/
  // period_label чи еквівалент). Один рядок → ряд плиток у стилі "Картки
  // КПІ" (число 36px над підписом 20px, ITFLight, праворуч). Кілька рядків
  // (розбивка по періоду/групі) → "Список" зі стовпцями, той самий підхід,
  // що й "🏥 Список відділень".
  type CubeFieldDef = { key: string; label: string; suffix?: string };
  const addCubeRowsToCanvas = (
    rows: Record<string, unknown>[],
    fields: CubeFieldDef[],
    labelField: string,
    title: string
  ) => {
    if (!rows || rows.length === 0) {
      alert("Немає даних за цим запитом");
      return;
    }

    if (rows.length === 1) {
      const row = rows[0];
      const tileWidth = 200;
      const tileHeight = 70;
      const gap = 24;
      const totalWidth = tileWidth * fields.length + gap * (fields.length - 1);
      const freePos = findFreePosition(forcedParentId, totalWidth, tileHeight);
      const newElements: CanvasElement[] = [];
      const tileIds: number[] = [];
      fields.forEach((f, i) => {
        const parentId = Date.now() + i * 10;
        tileIds.push(parentId);
        const raw = row[f.key];
        const value = raw === null || raw === undefined ? "—" : `${raw}${f.suffix || ""}`;
        const x = freePos.x + i * (tileWidth + gap);
        newElements.push({
          ...buildComplexObjectBase(parentId, ""),
          type: "block",
          width: tileWidth,
          height: tileHeight,
          x,
          y: freePos.y,
          customBgColor: "#ffffff",
          bgOpacity: 0,
          padding: 0,
          borderRadius: 0,
        });
        newElements.push({
          ...buildComplexObjectBase(parentId + 1, value),
          type: "text",
          width: tileWidth,
          height: 44,
          x: 0,
          y: 0,
          parentId,
          fontSize: 36,
          fontWeight: "300",
          textColor: "#1a1a1a",
          textAlign: "right",
          bgOpacity: 0,
          padding: 0,
        });
        newElements.push({
          ...buildComplexObjectBase(parentId + 2, f.label),
          type: "text",
          width: tileWidth,
          height: 26,
          x: 0,
          y: 44,
          parentId,
          fontSize: 20,
          fontWeight: "300",
          textColor: "#9a958f",
          textAlign: "right",
          bgOpacity: 0,
          padding: 0,
        });
      });
      updateElementsAndHistory([...elements, ...newElements]);
      setSelectedIds(tileIds);
      return;
    }

    const columns: ListColumn[] = [
      { id: "__label", label: "Група/період", width: 1.6 },
      ...fields.map((f) => ({ id: f.key, label: f.label, width: 1 })),
    ];
    const listId = Date.now();
    const cardWidth = Math.min(820, 200 + columns.length * 90);
    const cardHeight = 420;
    const freePos = findFreePosition(forcedParentId, cardWidth, cardHeight);
    const listElement: CanvasElement = {
      ...buildComplexObjectBase(listId, title),
      type: "list",
      width: cardWidth,
      height: cardHeight,
      x: freePos.x,
      y: freePos.y,
      textColor: "#ffffff",
      padding: 8,
      borderRadius: 0,
      columns,
    };
    const rowElements: CanvasElement[] = rows.map((row, i) => {
      const columnValues: Record<string, string> = { __label: String(row[labelField] ?? "") };
      fields.forEach((f) => {
        const raw = row[f.key];
        columnValues[f.key] = raw === null || raw === undefined ? "—" : `${raw}${f.suffix || ""}`;
      });
      return {
        ...buildComplexObjectBase(listId + 1 + i, String(row[labelField] ?? "")),
        type: "text",
        width: 120,
        height: 30,
        x: 1,
        y: 1,
        textColor: "#000000",
        parentId: listId,
        columnValues,
      };
    });
    updateElementsAndHistory([...elements, listElement, ...rowElements]);
    handleSelectElement(listId);
  };

  // Додає похідне поле row_label до рядків куба (group_key + period_label,
  // об'єднані), щоб "Список" (при кількох рядках) мав змістовний підпис
  // рядка навіть коли обидва поля заповнені одночасно (напр. відділення×місяць).
  const withRowLabel = (rows: Record<string, unknown>[]): Record<string, unknown>[] =>
    rows.map((r) => {
      const group = r.group_key ? String(r.group_key) : "";
      const period = r.period_label && r.period_label !== "Весь час" ? String(r.period_label) : "";
      const row_label = [group, period].filter(Boolean).join(" · ") || "Весь час";
      return { ...r, row_label };
    });

  // Прив'язує ОБРАНЕ на полотні число+підпис "📊 Картки КПІ" до живого
  // показника — не тягне жодних даних сама (лишає число "—"): фіксує лише
  // params (усе, КРІМ періоду — рівень/напрямок/відділення/МКХ-10, залежно
  // від джерела) і яке поле відповіді показувати, підпис заповнює одразу
  // (той не залежить від дати). Число з'явиться, коли підключиш до цієї ж
  // картки часове джерело через "🔗 Зв'язки" (runConnectionActions робить
  // fetch за цим liveBinding). Працює незалежно від того, що саме виділено
  // — число, підпис чи саму рамку картки — знаходить пару серед дітей.
  const handleBindLiveIndicator = (
    source: NonNullable<CanvasElement["liveBinding"]>["source"],
    field: CubeFieldDef,
    params: Record<string, string>
  ) => {
    if (selectedIds.length !== 1) {
      alert("Спершу виділіть на полотні порожню «📊 Картку КПІ» (клікніть на число чи підпис)");
      return;
    }
    const el = elements.find((item) => item.id === selectedIds[0]);
    if (!el) return;

    const numberEl = el.isKpiNumberSlot
      ? el
      : el.isKpiLabelSlot
        ? elements.find((item) => item.parentId === el.parentId && item.isKpiNumberSlot)
        : elements.find((item) => item.parentId === el.id && item.isKpiNumberSlot);
    const labelEl = el.isKpiLabelSlot
      ? el
      : el.isKpiNumberSlot
        ? elements.find((item) => item.parentId === el.parentId && item.isKpiLabelSlot)
        : elements.find((item) => item.parentId === el.id && item.isKpiLabelSlot);

    if (!numberEl || !labelEl) {
      alert("Це не «📊 Картка КПІ» — додайте її зі списку об'єктів (вкладка «Об'єкти») і виділіть перед прив'язкою");
      return;
    }

    const next = elements.map((item) => {
      if (item.id === numberEl.id) {
        return { ...item, liveBinding: { source, field: field.key, suffix: field.suffix, params }, content: "—", timeContext: undefined };
      }
      if (item.id === labelEl.id) {
        return { ...item, content: field.label };
      }
      return item;
    });
    updateElementsAndHistory(next);

    // Прив'язка сама по собі не тягне жодних даних (num лишається "—") —
    // наступний обов'язковий крок ЗАВЖДИ "🔗 Зв'язки" (часове джерело, і
    // для деяких кубів ще діагностичний/лікарський вузол). Перемикаємо
    // вкладку одразу, замість лишати користувача шукати її самому після
    // підказки в тексті вище. НЕ чіпаємо selectedIds — окремий useEffect
    // (нижче за кодом, стежить за selectedIds) одразу повертав би назад
    // на "Параметри" при будь-якій, навіть однаковій за вмістом, зміні
    // виділення (нова посилання на масив — вже інша залежність).
    setActivePanelTab("links");
  };

  // Додає "📈 Графік" (Recharts) на полотно — знімок отриманих rows, без
  // жодного подальшого підключення до дати (на відміну від "📊 Картки
  // КПІ" вище): якщо треба інший період — перебудовуєш графік наново з
  // відповідної форми куба. labelField для "Точкова" — це числове поле X
  // (переданий як звичайна метрика), для решти 4 типів — текстова мітка.
  const addRowsAsChart = (
    rows: Record<string, unknown>[],
    labelField: string,
    valueFields: string[],
    chartKind: ChartKind,
    title: string
  ) => {
    if (!rows || rows.length === 0) {
      alert("Немає даних за цим запитом");
      return;
    }
    const width = 420;
    const height = 280;
    const freePos = findFreePosition(forcedParentId, width, height);
    const newElement: CanvasElement = {
      ...buildComplexObjectBase(Date.now(), title),
      type: "chart",
      width,
      height,
      x: freePos.x,
      y: freePos.y,
      // buildComplexObjectBase не задає customBgColor (пресети-кнопки
      // самі обирають колір) — без цього картка графіка успадкувала б
      // дефолтний "кольору за глибиною" (LEVEL_COLORS) фон, як звичайна
      // кнопка. Тут — чиста біла картка, той самий стиль, що й "Картка КПІ".
      customBgColor: "#ffffff",
      textColor: "#1a1a1a",
      padding: 0,
      chartKind,
      chartData: rows,
      chartLabelField: labelField,
      chartValueFields: valueFields,
    };
    updateElementsAndHistory([...elements, newElement]);
    handleSelectElement(newElement.id);
  };

  // Спільна форма "📈 Додати як графік" для всіх 6 панелей кубів нижче:
  // тип графіка + один показник (для "Точкова" — окремо X і Y, бо це не
  // мітка+значення, а дві метрики). fields — той самий список полів, що
  // й для "Завантажити на полотно" в тій самій панелі.
  const renderChartAdderSection = (
    accent: "cyan" | "orange",
    fields: CubeFieldDef[],
    kind: ChartKind,
    setKind: (k: ChartKind) => void,
    fieldKey: string,
    setFieldKey: (k: string) => void,
    fieldKeyY: string,
    setFieldKeyY: (k: string) => void,
    onAdd: () => void
  ) => {
    const s = CHART_ADDER_STYLES[accent];
    return (
      <div className={s.section}>
        <div className={s.label}>📈 Додати як графік</div>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ChartKind)}
          className="w-full p-1.5 border rounded-md text-xs bg-white"
        >
          <option value="bar">Стовпчикова</option>
          <option value="line">Лінійна</option>
          <option value="area">Площинна</option>
          <option value="pie">Секторна</option>
          <option value="scatter">Точкова</option>
        </select>
        {kind === "scatter" ? (
          <>
            <select
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              className="w-full p-1.5 border rounded-md text-xs bg-white"
            >
              <option value="">X-показник…</option>
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={fieldKeyY}
              onChange={(e) => setFieldKeyY(e.target.value)}
              className="w-full p-1.5 border rounded-md text-xs bg-white"
            >
              <option value="">Y-показник…</option>
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </>
        ) : (
          <select
            value={fieldKey}
            onChange={(e) => setFieldKey(e.target.value)}
            className="w-full p-1.5 border rounded-md text-xs bg-white"
          >
            <option value="">Оберіть показник…</option>
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={onAdd}
          disabled={kind === "scatter" ? !fieldKey || !fieldKeyY : !fieldKey}
          className={s.button}
        >
          📈 Додати графік на полотно
        </button>
      </div>
    );
  };

  // "📊 Показники (лікарня/напрямок/відділення)" — рівень + часова
  // гранулярність + опційний фільтр напрямку/відділення, RPC
  // public.lpz_indicator_cube (/api/indicators/hierarchy).
  const [hierarchyLevel, setHierarchyLevel] = useState<"hospital" | "direction" | "department">("hospital");
  const [hierarchyGrain, setHierarchyGrain] = useState<string>("");
  const [hierarchyDirection, setHierarchyDirection] = useState("");
  const [hierarchyDepartment, setHierarchyDepartment] = useState("");
  const [hierarchyShift, setHierarchyShift] = useState<string>("");
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchyBindField, setHierarchyBindField] = useState("");
  const [hierarchyChartKind, setHierarchyChartKind] = useState<ChartKind>("bar");
  const [hierarchyChartField, setHierarchyChartField] = useState("");
  const [hierarchyChartFieldY, setHierarchyChartFieldY] = useState("");

  const HIERARCHY_FIELDS: CubeFieldDef[] = [
    { key: "total_cases", label: "ВИПАДКІВ" },
    { key: "unique_patients", label: "ПАЦІЄНТІВ" },
    { key: "deaths", label: "СМЕРТЕЙ" },
    { key: "death_rate_pct", label: "ЛЕТАЛЬНІСТЬ", suffix: "%" },
    { key: "improved", label: "ПОЛІПШЕННЯ" },
    { key: "nochange", label: "БЕЗ ЗМІН" },
    { key: "worse", label: "ПОГІРШЕННЯ" },
    { key: "transferred", label: "ПЕРЕВЕДЕНО" },
    { key: "total_bed_days", label: "ЛІЖКО-ДНІВ" },
    { key: "avg_bed_days", label: "СЕР. ЛІЖКО-ДНІВ" },
    { key: "max_bed_days", label: "МАКС. ЛІЖКО-ДНІВ" },
    { key: "avg_age", label: "СЕРЕДНІЙ ВІК" },
    { key: "women", label: "ЖІНОК" },
    { key: "men", label: "ЧОЛОВІКІВ" },
    { key: "children", label: "ДІТЕЙ" },
    { key: "elderly", label: "ПОХИЛОГО ВІКУ" },
  ];

  const handleLoadHierarchy = async () => {
    setHierarchyLoading(true);
    try {
      const params = new URLSearchParams({ level: hierarchyLevel });
      if (hierarchyGrain) params.set("grain", hierarchyGrain);
      if (hierarchyDirection.trim()) params.set("direction", hierarchyDirection.trim());
      if (hierarchyDepartment.trim()) params.set("department", hierarchyDepartment.trim());
      if (hierarchyShift) params.set("shift", hierarchyShift);
      if (selectedHospital?.edrpou) params.set("org", selectedHospital.edrpou);
      const res = await fetch(`/api/indicators/hierarchy?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      addCubeRowsToCanvas(withRowLabel(data.rows || []), HIERARCHY_FIELDS, "row_label", "Показники (ієрархія)");
    } catch {
      alert("Не вдалося звернутись до сервера");
    } finally {
      setHierarchyLoading(false);
    }
  };

  const handleAddHierarchyChart = async () => {
    try {
      const params = new URLSearchParams({ level: hierarchyLevel });
      if (hierarchyGrain) params.set("grain", hierarchyGrain);
      if (hierarchyDirection.trim()) params.set("direction", hierarchyDirection.trim());
      if (hierarchyDepartment.trim()) params.set("department", hierarchyDepartment.trim());
      if (hierarchyShift) params.set("shift", hierarchyShift);
      if (selectedHospital?.edrpou) params.set("org", selectedHospital.edrpou);
      const res = await fetch(`/api/indicators/hierarchy?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      const rows = withRowLabel(data.rows || []);
      if (hierarchyChartKind === "scatter") {
        addRowsAsChart(rows, hierarchyChartField, [hierarchyChartFieldY], "scatter", "Показники (ієрархія)");
      } else {
        addRowsAsChart(rows, "row_label", [hierarchyChartField], hierarchyChartKind, "Показники (ієрархія)");
      }
    } catch {
      alert("Не вдалося звернутись до сервера");
    }
  };

  // "👨‍⚕️ Лікар (обсяг, ієрархія)" — RPC public.lpz_doctor_indicator_cube
  // (/api/indicators/doctor-hierarchy). Лише обсягові показники — надійного
  // зв'язку конкретної госпіталізації з конкретним лікарем немає.
  const [doctorHierGrain, setDoctorHierGrain] = useState<string>("");
  const [doctorHierDirection, setDoctorHierDirection] = useState("");
  const [doctorHierDepartment, setDoctorHierDepartment] = useState("");
  const [doctorHierLoading, setDoctorHierLoading] = useState(false);
  const [doctorHierChartKind, setDoctorHierChartKind] = useState<ChartKind>("bar");
  const [doctorHierChartField, setDoctorHierChartField] = useState("");
  const [doctorHierChartFieldY, setDoctorHierChartFieldY] = useState("");
  const [doctorHierBindField, setDoctorHierBindField] = useState("");

  const DOCTOR_HIER_FIELDS: CubeFieldDef[] = [
    { key: "total_cases", label: "ВИПАДКІВ" },
    { key: "unique_patients", label: "ПАЦІЄНТІВ" },
    { key: "avg_bed_days", label: "СЕР. ЛІЖКО-ДНІВ" },
  ];

  const handleLoadDoctorHierarchy = async () => {
    setDoctorHierLoading(true);
    try {
      const params = new URLSearchParams();
      if (doctorHierGrain) params.set("grain", doctorHierGrain);
      if (doctorHierDirection.trim()) params.set("direction", doctorHierDirection.trim());
      if (doctorHierDepartment.trim()) params.set("department", doctorHierDepartment.trim());
      if (selectedHospital?.edrpou) params.set("org", selectedHospital.edrpou);
      const res = await fetch(`/api/indicators/doctor-hierarchy?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      const rows = (data.rows || []).map((r: Record<string, unknown>) => ({
        ...r,
        row_label: [r.doctor_name, r.period_label && r.period_label !== "Весь час" ? r.period_label : null]
          .filter(Boolean)
          .join(" · "),
      }));
      addCubeRowsToCanvas(rows, DOCTOR_HIER_FIELDS, "row_label", "Лікарі (обсяг)");
    } catch {
      alert("Не вдалося звернутись до сервера");
    } finally {
      setDoctorHierLoading(false);
    }
  };

  const handleAddDoctorHierarchyChart = async () => {
    try {
      const params = new URLSearchParams();
      if (doctorHierGrain) params.set("grain", doctorHierGrain);
      if (doctorHierDirection.trim()) params.set("direction", doctorHierDirection.trim());
      if (doctorHierDepartment.trim()) params.set("department", doctorHierDepartment.trim());
      if (selectedHospital?.edrpou) params.set("org", selectedHospital.edrpou);
      const res = await fetch(`/api/indicators/doctor-hierarchy?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      const rows = (data.rows || []).map((r: Record<string, unknown>) => ({
        ...r,
        row_label: [r.doctor_name, r.period_label && r.period_label !== "Весь час" ? r.period_label : null]
          .filter(Boolean)
          .join(" · "),
      }));
      if (doctorHierChartKind === "scatter") {
        addRowsAsChart(rows, doctorHierChartField, [doctorHierChartFieldY], "scatter", "Лікарі (обсяг)");
      } else {
        addRowsAsChart(rows, "row_label", [doctorHierChartField], doctorHierChartKind, "Лікарі (обсяг)");
      }
    } catch {
      alert("Не вдалося звернутись до сервера");
    }
  };

  // "🔁 Повторні госпіталізації" — RPC public.lpz_readmission_cube
  // (/api/indicators/readmissions).
  const [readmitLevel, setReadmitLevel] = useState<"hospital" | "direction" | "department">("hospital");
  const [readmitGrain, setReadmitGrain] = useState<string>("");
  const [readmitLoading, setReadmitLoading] = useState(false);
  const [readmitBindField, setReadmitBindField] = useState("");
  const [readmitChartKind, setReadmitChartKind] = useState<ChartKind>("bar");
  const [readmitChartField, setReadmitChartField] = useState("");
  const [readmitChartFieldY, setReadmitChartFieldY] = useState("");

  const READMIT_FIELDS: CubeFieldDef[] = [
    { key: "total_with_followup", label: "З ПОДАЛЬШИМ СПОСТЕРЕЖЕННЯМ" },
    { key: "readmit_30d", label: "ПОВТОРНИХ ЗА 30д" },
    { key: "readmit_30d_pct", label: "% ЗА 30д", suffix: "%" },
    { key: "readmit_90d", label: "ПОВТОРНИХ ЗА 90д" },
    { key: "readmit_90d_pct", label: "% ЗА 90д", suffix: "%" },
    { key: "same_dx_30d", label: "ТОЙ САМИЙ ДІАГНОЗ (30д)" },
  ];

  const handleLoadReadmissions = async () => {
    setReadmitLoading(true);
    try {
      const params = new URLSearchParams({ level: readmitLevel });
      if (readmitGrain) params.set("grain", readmitGrain);
      if (selectedHospital?.edrpou) params.set("org", selectedHospital.edrpou);
      const res = await fetch(`/api/indicators/readmissions?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      addCubeRowsToCanvas(withRowLabel(data.rows || []), READMIT_FIELDS, "row_label", "Повторні госпіталізації");
    } catch {
      alert("Не вдалося звернутись до сервера");
    } finally {
      setReadmitLoading(false);
    }
  };

  const handleAddReadmissionsChart = async () => {
    try {
      const params = new URLSearchParams({ level: readmitLevel });
      if (readmitGrain) params.set("grain", readmitGrain);
      if (selectedHospital?.edrpou) params.set("org", selectedHospital.edrpou);
      const res = await fetch(`/api/indicators/readmissions?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      const rows = withRowLabel(data.rows || []);
      if (readmitChartKind === "scatter") {
        addRowsAsChart(rows, readmitChartField, [readmitChartFieldY], "scatter", "Повторні госпіталізації");
      } else {
        addRowsAsChart(rows, "row_label", [readmitChartField], readmitChartKind, "Повторні госпіталізації");
      }
    } catch {
      alert("Не вдалося звернутись до сервера");
    }
  };

  // "🩻 Показники по діагнозу" — RPC public.lpz_diagnosis_cube
  // (/api/indicators/diagnoses). Пошук за початком коду МКХ (ilike 'код%').
  const [diagnosisIcd, setDiagnosisIcd] = useState("");
  const [diagnosisShift, setDiagnosisShift] = useState<string>("");
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisBindField, setDiagnosisBindField] = useState("");
  const [diagnosisChartKind, setDiagnosisChartKind] = useState<ChartKind>("bar");
  const [diagnosisChartField, setDiagnosisChartField] = useState("");
  const [diagnosisChartFieldY, setDiagnosisChartFieldY] = useState("");

  const DIAGNOSIS_FIELDS: CubeFieldDef[] = [
    { key: "cases", label: "ВИПАДКІВ" },
    { key: "patients", label: "ПАЦІЄНТІВ" },
    { key: "deaths", label: "СМЕРТЕЙ" },
    { key: "death_rate_pct", label: "ЛЕТАЛЬНІСТЬ", suffix: "%" },
    { key: "avg_bed_days", label: "СЕР. ЛІЖКО-ДНІВ" },
    { key: "avg_age", label: "СЕРЕДНІЙ ВІК" },
    { key: "women", label: "ЖІНОК" },
    { key: "men", label: "ЧОЛОВІКІВ" },
  ];

  const handleLoadDiagnoses = async () => {
    setDiagnosisLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (diagnosisIcd.trim()) params.set("icd", diagnosisIcd.trim());
      if (diagnosisShift) params.set("shift", diagnosisShift);
      if (selectedHospital?.edrpou) params.set("org", selectedHospital.edrpou);
      const res = await fetch(`/api/indicators/diagnoses?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      addCubeRowsToCanvas(data.rows || [], DIAGNOSIS_FIELDS, "icd_primary", "Показники по діагнозу");
    } catch {
      alert("Не вдалося звернутись до сервера");
    } finally {
      setDiagnosisLoading(false);
    }
  };

  const handleAddDiagnosisChart = async () => {
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (diagnosisIcd.trim()) params.set("icd", diagnosisIcd.trim());
      if (diagnosisShift) params.set("shift", diagnosisShift);
      if (selectedHospital?.edrpou) params.set("org", selectedHospital.edrpou);
      const res = await fetch(`/api/indicators/diagnoses?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      const rows = data.rows || [];
      if (diagnosisChartKind === "scatter") {
        addRowsAsChart(rows, diagnosisChartField, [diagnosisChartFieldY], "scatter", "Показники по діагнозу");
      } else {
        addRowsAsChart(rows, "icd_primary", [diagnosisChartField], diagnosisChartKind, "Показники по діагнозу");
      }
    } catch {
      alert("Не вдалося звернутись до сервера");
    }
  };

  // "🧑‍🤝‍🧑 Демографія пацієнтів" — RPC public.lpz_patient_demo_cube
  // (/api/indicators/patient-demo), group by стать × вікова група.
  const [patientDemoGrain, setPatientDemoGrain] = useState<string>("");
  const [patientDemoLoading, setPatientDemoLoading] = useState(false);
  const [patientDemoChartKind, setPatientDemoChartKind] = useState<ChartKind>("bar");
  const [patientDemoChartField, setPatientDemoChartField] = useState("");
  const [patientDemoChartFieldY, setPatientDemoChartFieldY] = useState("");

  const PATIENT_DEMO_FIELDS: CubeFieldDef[] = [
    { key: "cases", label: "ВИПАДКІВ" },
    { key: "unique_patients", label: "ПАЦІЄНТІВ" },
    { key: "deaths", label: "СМЕРТЕЙ" },
    { key: "death_rate_pct", label: "ЛЕТАЛЬНІСТЬ", suffix: "%" },
    { key: "avg_bed_days", label: "СЕР. ЛІЖКО-ДНІВ" },
  ];

  const handleLoadPatientDemo = async () => {
    setPatientDemoLoading(true);
    try {
      const params = new URLSearchParams();
      if (patientDemoGrain) params.set("grain", patientDemoGrain);
      if (selectedHospital?.edrpou) params.set("org", selectedHospital.edrpou);
      const res = await fetch(`/api/indicators/patient-demo?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      const rows = (data.rows || []).map((r: Record<string, unknown>) => ({
        ...r,
        row_label: [
          r.gender === "Ж" ? "Жінки" : "Чоловіки",
          r.age_group,
          r.period_label && r.period_label !== "Весь час" ? r.period_label : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }));
      addCubeRowsToCanvas(rows, PATIENT_DEMO_FIELDS, "row_label", "Демографія пацієнтів");
    } catch {
      alert("Не вдалося звернутись до сервера");
    } finally {
      setPatientDemoLoading(false);
    }
  };

  const handleAddPatientDemoChart = async () => {
    try {
      const params = new URLSearchParams();
      if (patientDemoGrain) params.set("grain", patientDemoGrain);
      if (selectedHospital?.edrpou) params.set("org", selectedHospital.edrpou);
      const res = await fetch(`/api/indicators/patient-demo?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      const rows = (data.rows || []).map((r: Record<string, unknown>) => ({
        ...r,
        row_label: [
          r.gender === "Ж" ? "Жінки" : "Чоловіки",
          r.age_group,
          r.period_label && r.period_label !== "Весь час" ? r.period_label : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }));
      if (patientDemoChartKind === "scatter") {
        addRowsAsChart(rows, patientDemoChartField, [patientDemoChartFieldY], "scatter", "Демографія пацієнтів");
      } else {
        addRowsAsChart(rows, "row_label", [patientDemoChartField], patientDemoChartKind, "Демографія пацієнтів");
      }
    } catch {
      alert("Не вдалося звернутись до сервера");
    }
  };

  // "🕐 Часові патерни" — RPC public.lpz_time_pattern_cube
  // (/api/indicators/time-patterns), group by година/день тижня/місяць.
  const [timePatternBucket, setTimePatternBucket] = useState<"hour" | "weekday" | "month">("weekday");
  const [timePatternLoading, setTimePatternLoading] = useState(false);
  const [timePatternChartKind, setTimePatternChartKind] = useState<ChartKind>("bar");
  const [timePatternChartField, setTimePatternChartField] = useState("");
  const [timePatternChartFieldY, setTimePatternChartFieldY] = useState("");

  const TIME_PATTERN_FIELDS: CubeFieldDef[] = [
    { key: "admissions", label: "ГОСПІТАЛІЗАЦІЙ" },
    { key: "deaths", label: "СМЕРТЕЙ" },
    { key: "night_admissions", label: "НІЧНИХ" },
  ];

  const handleLoadTimePatterns = async () => {
    setTimePatternLoading(true);
    try {
      const res = await fetch(`/api/indicators/time-patterns?bucket=${timePatternBucket}&org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      addCubeRowsToCanvas(data.rows || [], TIME_PATTERN_FIELDS, "bucket_label", "Часові патерни");
    } catch {
      alert("Не вдалося звернутись до сервера");
    } finally {
      setTimePatternLoading(false);
    }
  };

  const handleAddTimePatternChart = async () => {
    try {
      const res = await fetch(`/api/indicators/time-patterns?bucket=${timePatternBucket}&org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка: ${data.error || res.statusText}`);
        return;
      }
      const rows = data.rows || [];
      if (timePatternChartKind === "scatter") {
        addRowsAsChart(rows, timePatternChartField, [timePatternChartFieldY], "scatter", "Часові патерни");
      } else {
        addRowsAsChart(rows, "bucket_label", [timePatternChartField], timePatternChartKind, "Часові патерни");
      }
    } catch {
      alert("Не вдалося звернутись до сервера");
    }
  };

  // "🌙 Нічні чергування" / "🗓️ Вихідні чергування" — НЕ RPC-куб, а готові
  // таблиці lpz.lpz_night_vs_day_admissions / lpz.lpz_weekend_vs_weekday
  // (по 2 рядки на лікарню — рахувати наживо непотрібно). Обираєш один з
  // двох рядків (День/Ніч чи Вихідний/Робочий день) — addCubeRowsToCanvas
  // з масивом з ОДНОГО рядка завжди дає плитки "Картка КПІ" (не таблицю).
  type ShiftRow = {
    cases: number;
    unique_patients: number;
    avg_bed_days: number;
    urgent_cases: number;
    deaths: number;
    letality_percent: number;
  };
  const SHIFT_FIELDS: CubeFieldDef[] = [
    { key: "cases", label: "ГОСПІТАЛІЗАЦІЇ" },
    { key: "unique_patients", label: "ПАЦІЄНТІВ" },
    { key: "urgent_cases", label: "ЕКСТРЕНИХ" },
    { key: "deaths", label: "СМЕРТЕЙ" },
    { key: "letality_percent", label: "ЛЕТАЛЬНІСТЬ", suffix: "%" },
    { key: "avg_bed_days", label: "СЕР. ЛІЖКО-ДНІВ" },
  ];

  const [nightShiftRows, setNightShiftRows] = useState<(ShiftRow & { time_period: string })[] | null>(null);
  const [nightShiftLoading, setNightShiftLoading] = useState(false);
  const [nightShiftError, setNightShiftError] = useState<string | null>(null);

  const ensureNightShiftRows = async () => {
    setNightShiftLoading(true);
    setNightShiftError(null);
    try {
      const res = await fetch(`/api/indicators/night-shift?org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      if (!res.ok) {
        setNightShiftError(data.error || "Помилка завантаження");
        return;
      }
      setNightShiftRows(data.rows || []);
    } catch {
      setNightShiftError("Не вдалося звернутись до сервера");
    } finally {
      setNightShiftLoading(false);
    }
  };

  const handleAddNightShiftCard = (row: ShiftRow & { time_period: string }) => {
    addCubeRowsToCanvas([row], SHIFT_FIELDS, "time_period", `Нічні чергування — ${row.time_period}`);
  };

  const [weekendShiftRows, setWeekendShiftRows] = useState<(ShiftRow & { day_type: string })[] | null>(null);
  const [weekendShiftLoading, setWeekendShiftLoading] = useState(false);
  const [weekendShiftError, setWeekendShiftError] = useState<string | null>(null);

  const ensureWeekendShiftRows = async () => {
    setWeekendShiftLoading(true);
    setWeekendShiftError(null);
    try {
      const res = await fetch(`/api/indicators/weekend-shift?org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      if (!res.ok) {
        setWeekendShiftError(data.error || "Помилка завантаження");
        return;
      }
      setWeekendShiftRows(data.rows || []);
    } catch {
      setWeekendShiftError("Не вдалося звернутись до сервера");
    } finally {
      setWeekendShiftLoading(false);
    }
  };

  const handleAddWeekendShiftCard = (row: ShiftRow & { day_type: string }) => {
    addCubeRowsToCanvas([row], SHIFT_FIELDS, "day_type", `Вихідні чергування — ${row.day_type}`);
  };

  // "Показник (за списком)" — форма-конструктор картки КПІ на основі
  // довідника ЛСМД (той самий INDICATOR_SECTIONS, що й панель "Показники"):
  // шукаєш показник за кодом/назвою, вписуєш його поточне значення вручну
  // (це НЕ живий запит до бази — переважна більшість показників довідника
  // не прив'язана до жодного окремого API-ендпоінта, лише документує
  // код+назву+SQL-формулу), і додаєш на полотно готову плитку 1:1 у стилі
  // "Картки КПІ" (число 36px над підписом 20px ВЕЛИКИМИ, обидва праворуч).
  const [indicatorFormQuery, setIndicatorFormQuery] = useState("");
  const [indicatorFormSelected, setIndicatorFormSelected] = useState<
    (IndicatorRow & { sectionTitle: string }) | null
  >(null);
  const [indicatorFormValue, setIndicatorFormValue] = useState("");

  const normalizedIndicatorFormQuery = indicatorFormQuery.trim().toLowerCase();
  const indicatorFormMatches = normalizedIndicatorFormQuery
    ? INDICATOR_SECTIONS.flatMap((section) =>
        section.rows
          .filter(
            (row) =>
              row.code.toLowerCase().includes(normalizedIndicatorFormQuery) ||
              row.nameUk.toLowerCase().includes(normalizedIndicatorFormQuery)
          )
          .map((row) => ({ ...row, sectionTitle: section.title }))
      ).slice(0, 30)
    : [];

  const handleAddIndicatorCard = () => {
    if (!indicatorFormSelected || !indicatorFormValue.trim()) return;

    const tileWidth = 200;
    const tileHeight = 70;
    const freePos = findFreePosition(forcedParentId, tileWidth, tileHeight);
    const parentId = Date.now();

    const parentEl: CanvasElement = {
      ...buildComplexObjectBase(parentId, ""),
      type: "block",
      width: tileWidth,
      height: tileHeight,
      x: freePos.x,
      y: freePos.y,
      customBgColor: "#ffffff",
      bgOpacity: 0,
      padding: 0,
      borderRadius: 0,
    };
    const valueEl: CanvasElement = {
      ...buildComplexObjectBase(parentId + 1, indicatorFormValue.trim()),
      type: "text",
      width: tileWidth,
      height: 44,
      x: 0,
      y: 0,
      parentId,
      fontSize: 36,
      fontWeight: "300",
      textColor: "#1a1a1a",
      textAlign: "right",
      bgOpacity: 0,
      padding: 0,
    };
    const labelEl: CanvasElement = {
      ...buildComplexObjectBase(parentId + 2, indicatorFormSelected.nameUk.toUpperCase()),
      type: "text",
      width: tileWidth,
      height: 26,
      x: 0,
      y: 44,
      parentId,
      fontSize: 20,
      fontWeight: "300",
      textColor: "#9a958f",
      textAlign: "right",
      bgOpacity: 0,
      padding: 0,
    };

    updateElementsAndHistory([...elements, parentEl, valueEl, labelEl]);
    setSelectedIds([parentId]);
    setIndicatorFormSelected(null);
    setIndicatorFormValue("");
    setIndicatorFormQuery("");
  };

  // "Ординаторська відділення" — 1:1 з .docs-list/.doc-item на сторінці
  // завідувача старого проекту (public/shared/head-cabinet.css +
  // head-cabinet.js:loadStaff): шукаєш відділення (список тягнеться один
  // раз з /api/departments, як і кнопка "Завантажити відділення", фільтр —
  // на клієнті, бо відділень лише ~50), тоді "Завантажити ординаторську"
  // тягне реальних лікарів (/api/staff, lpz.lpz_empl) і ставить на полотно
  // стовпчик рядків doc-item (ім'я над посадою, підсвітка при наведенні) —
  // ту саму пресет-трійку (батько-кнопка + 2 текстові діти), що й пресет
  // "🩺 Рядок лікаря (ординаторська)", лише заповнена реальними даними й
  // повторена по одному разу на кожного лікаря.
  type StaffDepartment = { structure_id: string; name: string; org_edrpou: string };
  const [staffDeptQuery, setStaffDeptQuery] = useState("");
  const [staffDeptList, setStaffDeptList] = useState<StaffDepartment[] | null>(null);
  const [staffDeptListLoading, setStaffDeptListLoading] = useState(false);
  const [staffSelectedDept, setStaffSelectedDept] = useState<StaffDepartment | null>(null);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Список відділень кешується один раз (ensureStaffDeptList нижче), тож
  // зміна активної лікарні (гейт/"Скинути" в "🏥 Лікарня") мусить скинути
  // кеш — інакше після перемикання лишався б список відділень попередньої
  // лікарні, доки сторінку не перезавантажать.
  useEffect(() => {
    setStaffDeptList(null);
    setStaffSelectedDept(null);
  }, [selectedHospital?.edrpou]);

  const ensureStaffDeptList = async () => {
    if (staffDeptList !== null || staffDeptListLoading) return;
    setStaffDeptListLoading(true);
    try {
      const res = await fetch(`/api/departments?org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      setStaffDeptList(res.ok && data.departments ? data.departments : []);
    } catch {
      setStaffDeptList([]);
    } finally {
      setStaffDeptListLoading(false);
    }
  };

  const normalizedStaffDeptQuery = staffDeptQuery.trim().toLowerCase();
  const staffDeptMatches = (staffDeptList ?? []).filter((d) =>
    normalizedStaffDeptQuery ? d.name.toLowerCase().includes(normalizedStaffDeptQuery) : true
  );

  const handleLoadOrdinatorska = async () => {
    if (!staffSelectedDept) return;
    setStaffLoading(true);
    setStaffError(null);
    try {
      const res = await fetch(`/api/staff?department=${encodeURIComponent(staffSelectedDept.structure_id)}&org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      if (!res.ok) {
        setStaffError(data.error || "Помилка завантаження");
        return;
      }
      const staff: { resource_id: string; last_name: string; first_name: string; middle_name: string | null; position_name: string | null }[] =
        data.staff || [];
      if (staff.length === 0) {
        setStaffError("У цього відділення немає працівників у lpz_empl");
        return;
      }

      // Тип "Список" з stackedRows — фіксований розмір (не розтягує поле,
      // куди вкладений: getMinDimensions рахує лише саму цю коробку, не
      // висоту всіх рядків усередині) + внутрішній скрол із fade-маскою,
      // замість стовпчика окремих doc-item-елементів (той розтягував поле-
      // контейнер під ВСІХ лікарів і показував список без жодного
      // обмеження — 10 видимих рядків і скрол для решти, як і мало бути).
      // stackedRows: true — кожен рядок сам двоповерховий (ім'я над
      // посадою, ВЕЛИКИМИ, підсвітка при наведенні), 1:1 з .doc-item, а не
      // звична колонка "Поле"/"Значення" поруч.
      const listWidth = 280;
      const listHeight = 360;
      const freePos = findFreePosition(forcedParentId, listWidth, listHeight);
      const listId = Date.now();

      const listElement: CanvasElement = {
        ...buildComplexObjectBase(listId, `Ординаторська: ${staffSelectedDept.name}`),
        type: "list",
        width: listWidth,
        height: listHeight,
        x: freePos.x,
        y: freePos.y,
        parentId: forcedParentId,
        stackedRows: true,
      };

      const rowElements: CanvasElement[] = staff.map((doc, i) => {
        const fullName = [doc.last_name, doc.first_name, doc.middle_name].filter(Boolean).join(" ");
        return {
          ...buildComplexObjectBase(listId + 1 + i, fullName),
          type: "text",
          width: 120,
          height: 26,
          x: 1,
          y: 1,
          textColor: "#3a3a3a",
          padding: 4,
          fontSize: 17,
          fontWeight: "300",
          parentId: listId,
          subContent: doc.position_name || "—",
          // Ключ зв'язку з "Перебуває у відділенні" — той самий resource_id,
          // що lpz_hospitalization_doctors.doctor_id (перевірено join'ом).
          linkKey: doc.resource_id,
        };
      });

      updateElementsAndHistory([...elements, listElement, ...rowElements]);
      setSelectedIds([listId]);
    } catch {
      setStaffError("Не вдалося звернутись до сервера");
    } finally {
      setStaffLoading(false);
    }
  };

  // "Перебуває у відділенні" (реальні дані) — 1:1 за смислом з utils.js:
  // loadCensus, джерело — lpz.lpz_hospitalization_doctors (discharge_date
  // IS NULL), не lpz_hospitalizations.doc_resource_id (заповнений лише у
  // 4 з 2599 живих випадків — непридатно). linkKey = doctor_id — той самий
  // ключ, що на рядках Ординаторської (lpz_empl.resource_id) — клік на
  // пацієнта підсвітить і прокрутить до його лікаря, якщо той теж на
  // полотні (і навпаки — клік на лікаря підсвітить його пацієнтів).
  const [censusLoading, setCensusLoading] = useState(false);
  const [censusError, setCensusError] = useState<string | null>(null);

  const handleLoadCensus = async () => {
    if (!staffSelectedDept) return;
    setCensusLoading(true);
    setCensusError(null);
    try {
      const res = await fetch(`/api/departments/census?department=${encodeURIComponent(staffSelectedDept.name)}&org=${encodeURIComponent(selectedHospital?.edrpou ?? "")}`);
      const data = await res.json();
      if (!res.ok) {
        setCensusError(data.error || "Помилка завантаження");
        return;
      }
      const patients: { patient_name: string; admission_date: string | null; doctor_id: string | null; doctor_name: string | null }[] =
        data.patients || [];
      if (patients.length === 0) {
        setCensusError("У цього відділення зараз немає пацієнтів у lpz_hospitalization_doctors");
        return;
      }

      const listWidth = 280;
      const listHeight = 360;
      const freePos = findFreePosition(forcedParentId, listWidth, listHeight);
      const listId = Date.now();

      const listElement: CanvasElement = {
        ...buildComplexObjectBase(listId, `Перебуває у відділенні: ${staffSelectedDept.name}`),
        type: "list",
        width: listWidth,
        height: listHeight,
        x: freePos.x,
        y: freePos.y,
        parentId: forcedParentId,
        stackedRows: true,
      };

      const today = new Date();
      const rowElements: CanvasElement[] = patients.map((p, i) => {
        const days = p.admission_date
          ? Math.max(0, Math.round((today.getTime() - new Date(p.admission_date).getTime()) / 86400000))
          : null;
        const sub = [days !== null ? `${days} дн.` : null, p.doctor_name ? `лікар: ${p.doctor_name}` : null]
          .filter(Boolean)
          .join(" · ");
        return {
          ...buildComplexObjectBase(listId + 1 + i, p.patient_name || "—"),
          type: "text",
          width: 120,
          height: 26,
          x: 1,
          y: 1,
          textColor: "#3a3a3a",
          padding: 4,
          fontSize: 17,
          fontWeight: "300",
          parentId: listId,
          subContent: sub || "—",
          linkKey: p.doctor_id || undefined,
        };
      });

      updateElementsAndHistory([...elements, listElement, ...rowElements]);
      setSelectedIds([listId]);
    } catch {
      setCensusError("Не вдалося звернутись до сервера");
    } finally {
      setCensusLoading(false);
    }
  };

  const updateSelectedFields = (field: keyof CanvasElement, value: any) => {
    if (selectedIds.length === 0) return;
    const nextElements = elements.map((el) => {
      if (!selectedIds.includes(el.id)) return el;

      let newValue = value;
      if (field === "width" || field === "height") {
        const { minWidth, minHeight } = getMinDimensions(el.id);
        if (field === "width") newValue = Math.max(Number(value), minWidth);
        if (field === "height") newValue = Math.max(Number(value), minHeight);
      }

      return { ...el, [field]: newValue };
    });
    updateElementsAndHistory(nextElements);
  };

  const handleDeleteSelected = () => {
    const idsToDelete = new Set<number>(selectedIds);
    const findChildren = (targetId: number) => {
      elements.forEach((el) => {
        if (el.parentId === targetId) {
          idsToDelete.add(el.id);
          findChildren(el.id);
        }
      });
    };
    selectedIds.forEach((id) => findChildren(id));
    // Рядок дати динамічного бейджа (badgeDateSubId) — сиблінг поля-року в
    // тому самому батькові, НЕ його parentId-дитина, тож findChildren вище
    // його не бачить: якщо видаляють саме поле-рік (isBadgeYearField), його
    // авто-створений рядок дати лишився б сиротою на полотні.
    elements.forEach((el) => {
      if (idsToDelete.has(el.id) && el.badgeDateSubId != null) idsToDelete.add(el.badgeDateSubId);
    });
    const remaining = elements.filter((el) => !idsToDelete.has(el.id));
    setSelectedIds([]);
    // Якщо видалили саме той "блок"/"список", в який handleSelectElement
    // щойно "заблокував" вкладення нових елементів (forcedParentId) — скинути
    // його теж, інакше все, що додається ПІСЛЯ видалення, тихо вкладається в
    // уже неіснуючого батька (findFreePosition його не бачить, елемент існує
    // в даних, але ніколи не рендериться — сирота без видимого предка).
    if (forcedParentId != null && idsToDelete.has(forcedParentId)) {
      setForcedParentId(null);
    }

    // Зв'язки, що вказують на видалений елемент (як джерело чи як ціль),
    // самі стають "висячими" — прибираємо їх разом з елементом, інакше
    // "🔗 Зв'язки" лишає в списку зв'язок в нікуди. Елементи й зв'язки
    // фільтруються РАЗОМ в один крок історії (setElements/setConnections
    // напряму, saveToHistory викликається ОДИН раз з обома оновленими
    // значеннями) — інакше цей самий Ctrl+Z повернув би елемент без
    // зв'язку чи навпаки.
    const remainingConnections = connections.filter((c) => !idsToDelete.has(c.fromId) && !idsToDelete.has(c.toId));
    setElements(remaining);
    setConnections(remainingConnections);
    saveToHistory(pages, remaining, remainingConnections);

    setConnectionHiddenIds((prev) => {
      const next = new Set(prev);
      idsToDelete.forEach((id) => next.delete(id));
      return next;
    });
  };

  // Збирає елемент rootId разом з усіма нащадками як preorder-список
  // ОРИГІНАЛІВ (без нових id, без зміщення позицій) — саме так фрагмент
  // потрапляє в LibraryItem.elements; перезв'язка id/parentId відбувається
  // пізніше, при вставці (handleAddLibraryItem).
  const collectSubtreeElements = (rootId: number, source: CanvasElement[]): CanvasElement[] => {
    const original = source.find((el) => el.id === rootId);
    if (!original) return [];
    const children = source.filter((el) => el.parentId === rootId);
    return [original, ...children.flatMap((child) => collectSubtreeElements(child.id, source))];
  };

  // Зберігає поточне виділення (один чи кілька елементів, з усіма
  // піддеревами) як новий пункт бібліотеки під назвою name. Та сама логіка
  // визначення "коренів" виділення, що й у handleDuplicateSelected — якщо
  // вибрано і батька, і його дитину, дитина не зберігається окремим коренем.
  const handleSaveSelectionToLibrary = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName || selectedIds.length === 0) return;

    const rootIds = selectedIds.filter((id) => {
      const el = elements.find((e) => e.id === id);
      return el && !(el.parentId !== null && selectedIds.includes(el.parentId));
    });
    if (rootIds.length === 0) return;

    const itemElements = rootIds.flatMap((id) => collectSubtreeElements(id, elements));
    const itemIds = new Set(itemElements.map((el) => el.id));
    // Лише зв'язки, повністю ВСЕРЕДИНІ фрагмента — і джерело, і ціль мають
    // бути серед елементів, що зберігаються, інакше при вставці в іншому
    // місці/іншу сторінку ціль зв'язку могла б взагалі не існувати.
    const itemConnections = connections.filter((c) => itemIds.has(c.fromId) && itemIds.has(c.toId));
    const newItem: LibraryItem = {
      id: `lib-${Date.now()}`,
      name: trimmedName,
      elements: itemElements,
      rootIds,
      connections: itemConnections,
    };
    setLibraryItems((prev) => [...prev, newItem]);
    setLibraryNameDraft("");
  };

  // Вставляє збережений пункт бібліотеки на полотно поточної сторінки: нові
  // унікальні id для всіх елементів фрагмента, parentId дочірніх
  // перезв'язується на клоновані id, а корені — на forcedParentId (як і
  // будь-який інший щойно доданий елемент). Відносне розташування коренів
  // одне до одного зберігається — зміщується лише вся група разом, у перше
  // вільне місце на полотні.
  const handleAddLibraryItem = (item: LibraryItem) => {
    if (item.elements.length === 0) return;

    const idMap = new Map<number, number>();
    const baseId = Date.now();
    item.elements.forEach((el, i) => idMap.set(el.id, baseId + i));

    const roots = item.elements.filter((el) => item.rootIds.includes(el.id));
    const minX = Math.min(...roots.map((r) => r.x));
    const minY = Math.min(...roots.map((r) => r.y));
    const maxRight = Math.max(...roots.map((r) => r.x + r.width));
    const maxBottom = Math.max(...roots.map((r) => r.y + r.height));
    const freePos = findFreePosition(forcedParentId, maxRight - minX, maxBottom - minY);
    const offsetX = freePos.x - minX;
    const offsetY = freePos.y - minY;

    const newElements: CanvasElement[] = item.elements.map((el) => {
      const isRoot = item.rootIds.includes(el.id);
      const remappedParentId = isRoot
        ? forcedParentId
        : el.parentId !== null && idMap.has(el.parentId)
        ? idMap.get(el.parentId)!
        : forcedParentId;
      return {
        ...el,
        id: idMap.get(el.id)!,
        pageId: currentPageId,
        isGlobal: false,
        parentId: remappedParentId,
        x: isRoot ? el.x + offsetX : el.x,
        y: isRoot ? el.y + offsetY : el.y,
      };
    });

    // Зв'язки фрагмента (лише ті, де і джерело, і ціль всередині нього —
    // гарантовано з idMap) перезв'язуються на клоновані id так само, як
    // parentId вище, і отримують нові власні id (щоб той самий пункт
    // бібліотеки можна було вставляти повторно без колізій).
    const newConnections: ElementConnection[] = (item.connections ?? []).map((c, i) => ({
      id: `link-${baseId}-${i}`,
      fromId: idMap.get(c.fromId) ?? c.fromId,
      toId: idMap.get(c.toId) ?? c.toId,
      actions: c.actions,
    }));

    const nextElements = [...elements, ...newElements];
    const nextConnections = [...connections, ...newConnections];
    setElements(nextElements);
    setConnections(nextConnections);
    saveToHistory(pages, nextElements, nextConnections);
    setSelectedIds(roots.map((r) => idMap.get(r.id)!));
  };

  const handleDeleteLibraryItem = (id: string) => {
    setLibraryItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Зберігає поточне виділення як новий ВЛАСНИЙ складний об'єкт (панель
  // "Складні об'єкти") — та сама логіка визначення коренів і збору
  // піддерева, що й handleSaveSelectionToLibrary, лише пише в інший список.
  const handleSaveSelectionAsComplexObject = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName || selectedIds.length === 0) return;

    const rootIds = selectedIds.filter((id) => {
      const el = elements.find((e) => e.id === id);
      return el && !(el.parentId !== null && selectedIds.includes(el.parentId));
    });
    if (rootIds.length === 0) return;

    const itemElements = rootIds.flatMap((id) => collectSubtreeElements(id, elements));
    const newItem: CustomComplexObject = {
      id: `cobj-${Date.now()}`,
      name: trimmedName,
      elements: itemElements,
      rootIds,
    };
    setCustomComplexObjects((prev) => [...prev, newItem]);
    setComplexObjectNameDraft("");
  };

  const handleDeleteCustomComplexObject = (id: string) => {
    setCustomComplexObjects((prev) => prev.filter((item) => item.id !== id));
  };

  // Компактне дерево складу пункту бібліотеки (лише перегляд) — показує, з
  // яких простих елементів (тип + вміст) зібраний цей складний елемент і
  // як вони вкладені один в одного, за збереженими в item.elements
  // id/parentId. Корені item.rootIds малюються на нульовому рівні (їхній
  // "реальний" батько на полотні тут не має значення — при вставці він все
  // одно перепризначається), кожен наступний рівень — через фіксований
  // відступ, що природно накопичується завдяки вкладеності самих <div>.
  const renderLibraryItemTree = (item: LibraryItem) => {
    const byParent = new Map<number | null, CanvasElement[]>();
    item.elements.forEach((el) => {
      const key = item.rootIds.includes(el.id) ? null : el.parentId;
      const list = byParent.get(key) ?? [];
      list.push(el);
      byParent.set(key, list);
    });

    const renderLevel = (parentKey: number | null): React.ReactNode => {
      const kids = byParent.get(parentKey) ?? [];
      if (kids.length === 0) return null;
      return kids.map((el) => (
        <div key={el.id} className="ml-3">
          <div className="text-[10px] text-slate-500 flex items-center gap-1 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
            <span className="font-semibold text-slate-600 shrink-0">[{TYPE_LABELS[el.type]}]</span>
            <span className="truncate">{el.content || "—"}</span>
          </div>
          {renderLevel(el.id)}
        </div>
      ));
    };

    return <div className="-ml-3">{renderLevel(null)}</div>;
  };

  // Клонує елемент разом з усіма його нащадками, видаючи кожному новий унікальний id
  // та переприв'язуючи parentId дочірніх елементів до клонованих. Корінь дублікату
  // зміщується на +20/+20, щоб не лежати точно поверх оригіналу.
  const cloneSubtree = (
    rootId: number,
    idMap: Map<number, number>,
    baseId: number,
    isRoot: boolean
  ): CanvasElement[] => {
    const original = elements.find((el) => el.id === rootId);
    if (!original) return [];

    const newId = baseId + idMap.size;
    idMap.set(rootId, newId);

    const remappedParentId =
      original.parentId !== null && idMap.has(original.parentId)
        ? idMap.get(original.parentId)!
        : original.parentId;

    const clone: CanvasElement = {
      ...original,
      id: newId,
      parentId: remappedParentId,
      x: isRoot ? original.x + 20 : original.x,
      y: isRoot ? original.y + 20 : original.y,
    };

    const children = elements.filter((el) => el.parentId === rootId);
    const clonedChildren = children.flatMap((child) => cloneSubtree(child.id, idMap, baseId, false));

    return [clone, ...clonedChildren];
  };

  const handleDuplicateSelected = () => {
    if (selectedIds.length === 0) return;

    const idMap = new Map<number, number>();
    const baseId = Date.now();

    // Якщо вибрано і батька, і його дитину — дублюємо тільки з батька,
    // інакше дитина продублюється двічі (один раз сама, один раз як частина дерева батька).
    const rootIds = selectedIds.filter((id) => {
      const el = elements.find((e) => e.id === id);
      return el && !(el.parentId !== null && selectedIds.includes(el.parentId));
    });

    const duplicated = rootIds.flatMap((id) => cloneSubtree(id, idMap, baseId, true));

    updateElementsAndHistory([...elements, ...duplicated]);
    setSelectedIds(rootIds.map((id) => idMap.get(id)!).filter((id) => id !== undefined));
  };

  const isValidParent = (childId: number, targetParentId: number | null): boolean => {
    if (targetParentId === null) return true;
    if (childId === targetParentId) return false;

    let currentId: number | null = targetParentId;
    while (currentId !== null) {
      if (currentId === childId) return false;
      const parentEl = elements.find((el) => el.id === currentId);
      currentId = parentEl ? parentEl.parentId : null;
    }
    return true;
  };

  const changeParent = (elementId: number, newParent: number | null) => {
    if (!isValidParent(elementId, newParent)) {
      alert("Неможливо перемістити блок всередину самого себе!");
      return;
    }
    const nextElements = elements.map((el) =>
      el.id === elementId ? { ...el, parentId: newParent, x: 1, y: 1 } : el
    );
    updateElementsAndHistory(nextElements);
  };

  const renderCanvasNode = (el: CanvasElement) => {
    const children = elements.filter((child) => child.parentId === el.id && isVisibleOnPage(child, currentPageId));
    const isSelected = selectedIds.includes(el.id);
    const computedBgColor = applyBgOpacity(getElementColor(el), el.bgOpacity);
    const isButton = el.type === "button";

    // Перемикач "Рамка" живе на САМОМУ el (не на батькові) — тож тут рахуємо
    // колір ЙОГО батька, яким буде пофарбована рамка (ObjectFrame нижче).
    const framePar =
      el.frame && el.parentId !== null ? elements.find((p) => p.id === el.parentId) : undefined;
    const frameColor = framePar ? applyBgOpacity(getElementColor(framePar), framePar.bgOpacity) : null;

    const { minWidth, minHeight } = getMinDimensions(el.id);

    const glowBlur = el.glowBlur || 0;
    const glowColor = el.glowColor || "#3b82f6";
    const hoverShadow = glowBlur > 0 ? `0 0 ${glowBlur}px ${glowColor}` : "none";

    const activeGlowBlur = el.activeGlowBlur || 0;
    const activeGlowColor = el.activeGlowColor || glowColor;
    const activeShadow = activeGlowBlur > 0 ? `0 0 ${activeGlowBlur}px ${activeGlowColor}` : hoverShadow;

    const currentWidth = el.isPressed ? el.width + (el.activeWidthOffset || 0) : el.width;
    const currentHeight = el.isPressed ? el.height + (el.activeHeightOffset || 0) : el.height;

    const isTargetOfHover = elements.some((item) => getHoverTargetId(item, currentPageId) === el.id);
    const isTargetOfClick = elements.some((item) => getClickTargetId(item, currentPageId) === el.id);

    const hoveredSourceEl = hoveredElementId !== null ? elements.find((item) => item.id === hoveredElementId) : undefined;
    const isHoverTriggered = !!hoveredSourceEl && getHoverTargetId(hoveredSourceEl, currentPageId) === el.id;
    const isClickTriggered = clickedElementId === el.id;

    const shouldHide =
      (el.isTriggerTarget && (isTargetOfHover || isTargetOfClick) && !isHoverTriggered && !isClickTriggered && !isSelected) ||
      connectionHiddenIds.has(el.id);

    if (shouldHide) return null;

    // Обраний як "джерело" в режимі з'єднання (панель "🔗 Зв'язки") —
    // підсвітка рамкою, щоб було видно, що чекає на клік по цілі.
    const isPendingLinkSource = pendingLinkSourceId === el.id;

    return (
      <Rnd
        key={el.id}
        size={{ width: currentWidth, height: currentHeight }}
        position={{ x: el.x, y: el.y }}
        bounds="parent"
        dragGrid={enableGrid ? [1, 1] : [1, 1]}
        resizeGrid={enableGrid ? [1, 1] : [1, 1]}
        minWidth={minWidth}
        minHeight={minHeight}
        onDragStart={(e) => {
          e.stopPropagation();
          // Rnd ловить mousedown (а отже й початок звичайного кліку) РАНІШЕ
          // за onClick нижче. Якщо тут не перевіряти модифікатори, він би
          // завжди примусово скидав виділення до одного елемента ще ДО
          // того, як onClick встигне прочитати Shift/Ctrl/⌘ і додати
          // елемент до вибору — мультивибір на полотні (на відміну від
          // дерева в бічній панелі, де onDragStart немає) був би неможливий.
          // Тож при затиснутому модифікаторі просто нічого тут не робимо —
          // усю роботу виконає onClick.
          const isMultiKey = e.shiftKey || e.ctrlKey || e.metaKey;
          if (!isMultiKey && !selectedIds.includes(el.id)) {
            handleSelectElement(el.id, false);
          }
        }}
        onDragStop={(e, d) => {
          e.stopPropagation();
          // Див. коментар біля suppressNextCanvasClickRef: якщо це вкладений
          // елемент у тісному батькові, курсор при відпусканні кнопки миші
          // цілком міг опинитись далеко за межами самого елемента (bounds=
          // "parent" не пускає його самого так далеко) — над порожнім
          // полотном, чий click-обробник інакше одразу скинув би щойно
          // встановлене виділення.
          suppressNextCanvasClickRef.current = true;
          const siblings = elements.filter(
            (other) => other.id !== el.id && other.parentId === el.parentId && isVisibleOnPage(other, currentPageId)
          );
          const resolved = pushOutOfOverlap(d.x, d.y, currentWidth, currentHeight, siblings, 1);
          const nextElements = elements.map((item) => (item.id === el.id ? { ...item, x: resolved.x, y: resolved.y } : item));
          updateElementsAndHistory(nextElements);
        }}
        onResizeStop={(e, dir, ref, delta, pos) => {
          e.stopPropagation();
          suppressNextCanvasClickRef.current = true;
          const siblings = elements.filter(
            (other) => other.id !== el.id && other.parentId === el.parentId && isVisibleOnPage(other, currentPageId)
          );
          const proposed = {
            x: pos.x,
            y: pos.y,
            width: parseInt(ref.style.width),
            height: parseInt(ref.style.height),
          };
          const resolved = resolveResizeCollision(
            { x: el.x, y: el.y, width: el.width, height: el.height },
            proposed,
            siblings,
            1
          );
          const nextElements = elements.map((item) => (item.id === el.id ? { ...item, ...resolved } : item));
          updateElementsAndHistory(nextElements);
        }}
        enableResizing={!linkMode}
        disableDragging={linkMode}
        style={{ zIndex: isSelected ? 40 : 10 }}
      >
        <div
          onMouseEnter={() => setHoveredElementId(el.id)}
          onMouseLeave={() => setHoveredElementId(null)}
          onClick={(e) => handleButtonClick(e, el)}
          style={
            {
              backgroundColor: el.meshBg
                ? "#f0ece8"
                : el.isPressed
                ? (el.activeBgColor || el.hoverBgColor || computedBgColor)
                : computedBgColor,
              color: el.isPressed
                ? (el.activeTextColor || el.hoverTextColor || el.textColor || "#ffffff")
                : (el.textColor || "#ffffff"),
              width: "100%",
              height: "100%",
              borderRadius: `${el.borderRadius ?? (isButton ? 8 : 0)}px`,
              padding: `${el.padding || 0}px`,
              fontSize: `${el.fontSize || 12}px`,
              fontFamily: el.fontFamily || "inherit",
              fontWeight: el.fontWeight || "500",
              textAlign: el.textAlign || "left",
              boxShadow: isPendingLinkSource
                ? "0 0 0 3px #a21caf"
                : el.isPressed
                ? activeShadow
                : "none",

              "--hover-bg": isButton ? (el.hoverBgColor || computedBgColor) : computedBgColor,
              "--hover-text": isButton ? (el.hoverTextColor || el.textColor || "#ffffff") : (el.textColor || "#ffffff"),
              "--hover-shadow": isButton ? hoverShadow : "none",

              "--active-bg": isButton ? (el.activeBgColor || el.hoverBgColor || computedBgColor) : computedBgColor,
              "--active-text": isButton ? (el.activeTextColor || el.hoverTextColor || el.textColor || "#ffffff") : (el.textColor || "#ffffff"),
              "--active-scale": isButton ? (el.activeScale ?? 1) : 1,
              "--active-offset-y": isButton ? `${el.activeOffsetY ?? 0}px` : "0px",
              "--active-shadow": isButton ? activeShadow : hoverShadow,
              "--active-w-offset": isButton ? `${el.activeWidthOffset || 0}px` : "0px",
              "--active-h-offset": isButton ? `${el.activeHeightOffset || 0}px` : "0px",
            } as React.CSSProperties
          }
          className={`interactive-node relative box-border transition-all duration-75 cursor-pointer select-none ${
            isButton ? "is-button-element flex items-center justify-center" : ""
          }`}
        >
          {el.meshBg && renderMeshLayer(el.meshSpeed, el.meshIntensity, el.meshColors, -1)}

          {el.type === "button" && (
            <div className="font-bold truncate pointer-events-none opacity-90 w-full text-center px-1">
              {el.isPressed
                ? (el.activeContent || el.hoverContent || el.content)
                : (
                  <>
                    <span className="btn-default-text">{el.content}</span>
                    <span className="btn-hover-text hidden">{el.hoverContent || el.content}</span>
                  </>
                )}
            </div>
          )}
          {el.type === "heading" && (
            <div className="leading-tight pointer-events-none truncate w-full">
              {el.content}
            </div>
          )}
          {el.type === "text" && (
            <div
              className="pointer-events-none whitespace-pre-wrap leading-normal overflow-hidden h-full w-full"
              style={el.lineHeight != null ? { lineHeight: el.lineHeight } : undefined}
            >
              {el.content}
            </div>
          )}

          {el.type === "block" && el.content && (
            <div className="pointer-events-none whitespace-pre-wrap leading-normal overflow-hidden w-full h-full">
              {el.content}
            </div>
          )}

          {el.type === "chart" && (
            <div className="w-full h-full p-1">
              {el.content && (
                <div className="text-[10px] font-semibold text-slate-600 truncate px-1 pointer-events-none">{el.content}</div>
              )}
              <div style={{ width: "100%", height: el.content ? "calc(100% - 16px)" : "100%" }}>
                <ChartBody el={el} />
              </div>
            </div>
          )}

          {el.type === "image" && (
            el.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- шлях завжди public/ (лого лікарень) або довільний URL з поля, next/image тут зайвий
              <img
                src={el.imageUrl}
                alt={el.content}
                draggable={false}
                className="pointer-events-none w-full h-full object-contain"
              />
            ) : (
              <div className="pointer-events-none w-full h-full flex items-center justify-center text-[10px] text-white/60 border border-dashed border-white/40">
                Немає URL зображення
              </div>
            )
          )}

          {el.type === "clock" && clockNow && (
            <div className="pointer-events-none w-full h-full flex flex-col items-center justify-center text-center leading-tight gap-1 px-1">
              <div className="font-bold tabular-nums" style={{ fontSize: `${(el.fontSize || 12) * 1.7}px` }}>
                {clockNow.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
              <div className="opacity-80 capitalize truncate w-full" style={{ fontSize: `${el.fontSize || 12}px` }}>
                {clockNow.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
            </div>
          )}

          {el.type === "list" ? (
            <div className="absolute inset-0 flex flex-col pointer-events-auto">
              {el.content && (
                <div
                  className="shrink-0 px-1 pb-1 uppercase tracking-wide truncate pointer-events-none"
                  style={{
                    fontSize: `${el.fontSize || 12}px`,
                    color: el.textColor || "#000000",
                    fontFamily: el.fontFamily || "inherit",
                    fontWeight: el.fontWeight || "500",
                  }}
                >
                  {el.content}
                </div>
              )}
              {el.columns && el.columns.length > 0 && (
                <div className="shrink-0 flex items-center gap-2 px-1 pb-1 border-b border-black/15 pointer-events-none">
                  {el.columns.map((col) => (
                    <span
                      key={col.id}
                      className="truncate text-[10px] uppercase opacity-70"
                      style={{
                        flexGrow: col.width ?? 1,
                        flexBasis: 0,
                        minWidth: 0,
                        color: el.textColor || "#000000",
                        fontFamily: el.fontFamily || "inherit",
                        fontWeight: el.fontWeight || "500",
                      }}
                    >
                      {col.label}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-y-auto" ref={attachScrollFadeMask}>
                {children.length === 0 ? (
                  <div className="px-1 py-2 text-[11px] opacity-50 pointer-events-none">
                    Порожньо — виберіть цей список і додайте елемент
                  </div>
                ) : children.filter((child) => !connectionHiddenIds.has(child.id)).length === 0 ? (
                  <div className="px-1 py-2 text-[11px] opacity-50 pointer-events-none">
                    Немає рядків, що відповідають фільтру
                  </div>
                ) : (
                  children
                    .filter((child) => !connectionHiddenIds.has(child.id))
                    .map((child) => (
                    <div
                      key={child.id}
                      data-el-id={child.id}
                      onClick={(e) => {
                        e.stopPropagation();

                        // Той самий режим з'єднання, що й на звичайних
                        // елементах (handleButtonClick) — рядок списку теж
                        // може бути джерелом чи ціллю зв'язку (напр. клік
                        // на лікарі фільтрує список пацієнтів).
                        if (linkMode) {
                          if (pendingLinkSourceId === null) {
                            setPendingLinkSourceId(child.id);
                          } else if (pendingLinkSourceId === child.id) {
                            setPendingLinkSourceId(null);
                          } else {
                            const newConnection: ElementConnection = {
                              id: `link-${Date.now()}`,
                              fromId: pendingLinkSourceId,
                              toId: child.id,
                            };
                            updateConnectionsAndHistory([...connections, newConnection]);
                            setPendingLinkSourceId(null);
                          }
                          return;
                        }

                        handleSelectElement(child.id, e.shiftKey || e.ctrlKey || e.metaKey);
                        runConnectionActions(child.id);
                        if (child.linkKey) {
                          const matches = elements.filter(
                            (o) => o.id !== child.id && o.linkKey === child.linkKey && isVisibleOnPage(o, currentPageId)
                          );
                          setLinkedHighlightIds(new Set(matches.map((m) => m.id)));
                        } else if (linkedHighlightIds.size > 0) {
                          setLinkedHighlightIds(new Set());
                        }
                      }}
                      className={`px-1 py-1.5 border-b border-black/10 last:border-b-0 cursor-pointer transition-colors ${
                        el.stackedRows ? "text-right hover:text-[#b27c8b]" : "flex items-center gap-2"
                      } ${selectedIds.includes(child.id) ? "ring-2 ring-amber-400 ring-inset" : ""} ${
                        pendingLinkSourceId === child.id ? "ring-2 ring-fuchsia-500 ring-inset" : ""
                      }`}
                      style={{
                        color: child.textColor || "#000000",
                        backgroundColor: child.customBgColor || "transparent",
                        fontSize: `${child.fontSize || 12}px`,
                        fontFamily: child.fontFamily || "inherit",
                        fontWeight: child.fontWeight || "500",
                        textShadow: linkedHighlightIds.has(child.id)
                          ? "0 0 6px rgba(178,124,139,.55), 0 0 16px rgba(178,124,139,.45), 0 0 30px rgba(178,124,139,.3)"
                          : undefined,
                      }}
                    >
                      {el.stackedRows ? (
                        <>
                          <div className="truncate">{child.content}</div>
                          {child.subContent && (
                            <div className="truncate text-[0.6em] uppercase opacity-60">{child.subContent}</div>
                          )}
                        </>
                      ) : el.columns && el.columns.length > 0 ? (
                        el.columns.map((col) => (
                          <span
                            key={col.id}
                            className="truncate"
                            style={{ flexGrow: col.width ?? 1, flexBasis: 0, minWidth: 0 }}
                          >
                            {child.columnValues?.[col.id] || ""}
                          </span>
                        ))
                      ) : (
                        <span className="truncate">{child.content}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="relative w-full h-full pointer-events-auto">
                {children.map((child) => renderCanvasNode(child))}
              </div>
            </div>
          )}

          {frameColor && (
            <ObjectFrame
              thickness={el.frameThickness ?? 10}
              color={frameColor}
              radius={framePar?.borderRadius ?? 0}
              width={currentWidth}
              height={currentHeight}
              fade={el.frameFade ?? 3}
            />
          )}
        </div>
      </Rnd>
    );
  };

  // SVG-шар зі стрілками зв'язків поверх полотна (той самий прийом, що й
  // ObjectFrame — рахує позиції з x/y елементів, оновлюється на кожен
  // рендер, тобто сам іде за drag/resize). pointer-events:none, щоб не
  // заважати кліками по елементах під лінією.
  const renderConnectionsLayer = () => {
    const visibleConnections = connections.filter((c) => {
      const from = elements.find((e) => e.id === c.fromId);
      const to = elements.find((e) => e.id === c.toId);
      return !!from && !!to && isVisibleOnPage(from, currentPageId) && isVisibleOnPage(to, currentPageId);
    });
    if (visibleConnections.length === 0) return null;

    return (
      <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 46, overflow: "visible" }}>
        <defs>
          <marker id="connection-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#a21caf" />
          </marker>
        </defs>
        {visibleConnections.map((c) => {
          const from = getAbsolutePosition(c.fromId);
          const to = getAbsolutePosition(c.toId);
          if (!from || !to) return null;
          const x1 = from.x + from.width / 2;
          const y1 = from.y + from.height / 2;
          const x2 = to.x + to.width / 2;
          const y2 = to.y + to.height / 2;
          // Легкий вигин посередині (перпендикулярно до лінії джерело→ціль),
          // щоб зв'язок читався як крива "мотузка", а не пряма лінійка.
          const dx = x2 - x1;
          const dy = y2 - y1;
          const dist = Math.hypot(dx, dy) || 1;
          const curveOffset = Math.min(60, dist * 0.2);
          const cx = (x1 + x2) / 2 + (-dy / dist) * curveOffset;
          const cy = (y1 + y2) / 2 + (dx / dist) * curveOffset;
          return (
            <path
              key={c.id}
              d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
              fill="none"
              stroke="#a21caf"
              strokeWidth={2}
              markerEnd="url(#connection-arrow)"
            />
          );
        })}
      </svg>
    );
  };

  const renderSidebarTree = (parentId: number | null, depth = 0) => {
    const children = elements.filter((el) => el.parentId === parentId && isVisibleOnPage(el, currentPageId));
    if (children.length === 0) return null;

    return children.map((el) => {
      const isSelected = selectedIds.includes(el.id);
      const possibleParents = elements.filter(
        (p) => (p.type === "block" || p.type === "list") && isVisibleOnPage(p, currentPageId) && isValidParent(el.id, p.id)
      );
      const currentColor = getElementColor(el);
      const hasChildren = elements.some(
        (child) => child.parentId === el.id && isVisibleOnPage(child, currentPageId)
      );
      const isCollapsed = collapsedIds.has(el.id);

      return (
        <div key={el.id} className="space-y-1 my-1" style={{ marginLeft: `${depth * 10}px` }}>
          <div
            onClick={(e) => {
              handleSelectElement(el.id, e.shiftKey || e.ctrlKey || e.metaKey);
              // Клік у дереві ієрархії — той самий "клік на елементі", що й
              // на полотні чи в рядку списку: теж мусить запускати зв'язки,
              // підключені до цього елемента (напр. коли елемент незручно
              // клікнути напряму на полотні через панелі зверху).
              runConnectionActions(el.id);
            }}
            className={`p-2 rounded cursor-pointer text-xs flex items-center justify-between gap-2 transition-all ${
              isSelected
                ? "bg-slate-900 text-white font-bold shadow-md ring-2 ring-amber-400"
                : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-l-4"
            }`}
            style={{ borderLeftColor: isSelected ? undefined : currentColor }}
          >
            <div className="flex items-center gap-1.5 truncate">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(el.id)) next.delete(el.id);
                      else next.add(el.id);
                      return next;
                    });
                  }}
                  className={`shrink-0 w-3.5 text-center leading-none ${isSelected ? "text-white" : "text-slate-500"}`}
                  title={isCollapsed ? "Розгорнути" : "Згорнути"}
                >
                  {isCollapsed ? "▶" : "▼"}
                </button>
              ) : (
                <span className="shrink-0 w-3.5" />
              )}
              <span
                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                style={{ backgroundColor: currentColor }}
              />
              <span className="truncate">
                <span className="text-[10px] opacity-60 mr-1 font-semibold">
                  [{TYPE_LABELS[el.type]}] {el.isGlobal ? "(🌍)" : ""}{" "}
                  {!el.isGlobal && el.extraPageIds && el.extraPageIds.length > 0 ? "(📌)" : ""}{" "}
                  {el.cascadeGlobal ? "(➡️)" : ""} {el.excludeFromCascade ? "(🚫)" : ""}{" "}
                  {el.isTriggerTarget ? "(👁️)" : ""} {el.timeSourceUnit ? "(🕐)" : ""}{" "}
                  {el.excludeFromConnectionCascade ? "(🔗🚫)" : ""}
                </span>
                {el.content}
              </span>
            </div>

            <select
              value={el.parentId ?? ""}
              onChange={(e) => {
                e.stopPropagation();
                const val = e.target.value === "" ? null : Number(e.target.value);
                changeParent(el.id, val);
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] bg-white border border-slate-300 text-slate-700 rounded px-1 py-0.5"
            >
              <option value="">(Рівень 1)</option>
              {possibleParents.map((p) => (
                <option key={p.id} value={p.id}>
                  → {p.content}
                </option>
              ))}
            </select>
          </div>
          {!isCollapsed && renderSidebarTree(el.id, depth + 1)}
        </div>
      );
    });
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 text-slate-800 font-sans">
      <style jsx global>{`
        .is-button-element:hover {
          background-color: var(--hover-bg) !important;
          color: var(--hover-text) !important;
          box-shadow: var(--hover-shadow) !important;
        }
        .is-button-element:hover .btn-default-text {
          display: none !important;
        }
        .is-button-element:hover .btn-hover-text {
          display: inline !important;
        }

        .is-button-element:active {
          background-color: var(--active-bg) !important;
          color: var(--active-text) !important;
          transform: scale(var(--active-scale)) translateY(var(--active-offset-y)) !important;
          box-shadow: var(--active-shadow) !important;
          width: calc(100% + var(--active-w-offset)) !important;
          height: calc(100% + var(--active-h-offset)) !important;
        }
      `}</style>

      {/* ХЕДЕР */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap justify-between items-center gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-slate-900">Конструктор</h1>

          {/* ПЕРЕМИКАЧ СТОРІНОК */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border">
            {pages.map((p) => (
              <button
                key={p.id}
                onClick={() => { setCurrentPageId(p.id); setSelectedIds([]); }}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  currentPageId === p.id
                    ? "bg-white text-blue-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {p.name}
              </button>
            ))}
            <button
              onClick={handleAddPage}
              className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md font-bold shadow-xs"
              title="Додати нову сторінку"
            >
              +
            </button>
          </div>

          {/* КНОПКИ UNDO / REDO */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                historyIndex > 0
                  ? "bg-white text-slate-800 hover:bg-slate-200 shadow-xs"
                  : "text-slate-400 cursor-not-allowed"
              }`}
              title="Скасувати дія (Ctrl+Z)"
            >
              ↩️ Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                historyIndex < history.length - 1
                  ? "bg-white text-slate-800 hover:bg-slate-200 shadow-xs"
                  : "text-slate-400 cursor-not-allowed"
              }`}
              title="Повторити дія (Ctrl+Y)"
            >
              ↪️ Redo
            </button>
          </div>

          {/* ПЕРЕМИКАЧ СІТКИ (GRID) */}
          <button
            onClick={() => setEnableGrid(!enableGrid)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
              enableGrid
                ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            🧩 Сітка: {enableGrid ? "УВІМК (1px)" : "ВИМК"}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJSON}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-md text-xs shadow-sm flex items-center gap-1.5 transition-colors"
            >
              💾 Зберегти JSON
            </button>

            <button
              onClick={handleExportHTML}
              className="bg-orange-600 hover:bg-orange-700 text-white font-medium px-3 py-1.5 rounded-md text-xs shadow-sm flex items-center gap-1.5 transition-colors"
              title="Експортувати готову HTML-сторінку"
            >
              🌐 Експорт в HTML
            </button>

            <button
              onClick={triggerFileInput}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-3 py-1.5 rounded-md text-xs shadow-sm flex items-center gap-1.5 transition-colors"
            >
              📂 Завантажити JSON
            </button>

            <button
              onClick={handleImportDepartments}
              disabled={!selectedHospital}
              className={`font-medium px-3 py-1.5 rounded-md text-xs shadow-sm flex items-center gap-1.5 transition-colors ${
                selectedHospital
                  ? "bg-teal-600 hover:bg-teal-700 text-white"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
              title={
                selectedHospital
                  ? "Створити елемент 'Список' з відділеннями з Supabase (схема lpz)"
                  : "Спочатку оберіть лікарню в панелі «🧱 Інструменти»"
              }
            >
              🏥 Завантажити відділення
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportJSON}
              accept=".json"
              className="hidden"
            />
          </div>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <Rnd
          position={panelPos}
          size={toolsPanelCollapsed ? { width: panelSize.width, height: 44 } : panelSize}
          onDragStop={(e, d) => setPanelPos({ x: d.x, y: d.y })}
          onResizeStop={(e, dir, ref, delta, pos) => {
            setPanelSize({ width: parseInt(ref.style.width), height: parseInt(ref.style.height) });
            setPanelPos(pos);
          }}
          dragHandleClassName="panel-drag-handle"
          bounds="window"
          minWidth={260}
          minHeight={toolsPanelCollapsed ? 44 : 200}
          enableResizing={!toolsPanelCollapsed}
          style={{ zIndex: 50 }}
        >
        <aside
          className="w-full h-full backdrop-blur-sm rounded-xl border border-slate-200 shadow-lg flex flex-col overflow-hidden"
          style={{ backgroundColor: `rgba(255, 255, 255, ${panelOpacity})` }}
        >
          <div className="panel-drag-handle cursor-move bg-slate-900/80 text-white text-[11px] font-bold px-3 py-2 rounded-t-xl flex items-center justify-between gap-2 shrink-0 select-none">
            <span>⠿ 🧱 Інструменти</span>
            <div
              className="flex items-center gap-1.5 font-normal"
              onMouseDown={(e) => e.stopPropagation()}
              title="Прозорість панелі"
            >
              <span>👁️</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(panelOpacity * 100)}
                onChange={(e) => setPanelOpacity(Number(e.target.value) / 100)}
                className="w-16 cursor-pointer"
              />
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setToolsPanelCollapsed((prev) => !prev)}
              className="text-xs leading-none hover:text-slate-300 shrink-0"
              title={toolsPanelCollapsed ? "Розгорнути панель" : "Згорнути панель"}
            >
              {toolsPanelCollapsed ? "▶" : "▼"}
            </button>
          </div>
          {!toolsPanelCollapsed && (
          <>
          {!selectedHospital ? (
            // Гейт першого кроку: доки лікарню не обрано, панель "🧱 Інструменти"
            // показує ТІЛЬКИ цей вибір — жодних вкладок (Створити/Сторінка/...),
            // щоб подальша робота одразу йшла з активною темою кольорів
            // (lib/hospital-themes.ts). handleAddHospitalOrgCard і додає
            // картку, і встановлює selectedHospital — після цього гейт
            // сам ховається (умова тут же й спадає).
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto p-5">
              <div className="text-center space-y-1 pb-1">
                <div className="text-2xl">🏥</div>
                <h2 className="font-bold text-slate-900 text-sm">Оберіть лікарню</h2>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Активна лікарня визначає тему кольорів для всього, що ви будете створювати далі — це перший крок. Решта інструментів відкриється одразу після вибору.
                </p>
              </div>
              {orgListLoading && <div className="text-xs text-slate-400 text-center py-2">Завантаження…</div>}
              {!orgListLoading && orgList && orgList.length === 0 && (
                <div className="text-xs text-red-500 text-center py-2">Не вдалося завантажити лікарні</div>
              )}
              {!orgListLoading && orgList && orgList.length > 0 && (
                <div className="space-y-1.5">
                  {orgList.map((org) => (
                    <button
                      key={org.edrpou}
                      onClick={() => setSelectedOrg(org)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                        selectedOrg?.edrpou === org.edrpou
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "border-indigo-200 bg-white hover:bg-indigo-50"
                      }`}
                    >
                      <div className="font-bold">{org.display_name}</div>
                      <div className={`text-[10px] ${selectedOrg?.edrpou === org.edrpou ? "text-indigo-100" : "text-slate-500"}`}>
                        ЄДРПОУ {org.edrpou}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedOrg && (
                <button
                  onClick={handleAddHospitalOrgCard}
                  className="w-full bg-indigo-700 hover:bg-indigo-800 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                >
                  ➕ Додати назву й емблему та почати роботу
                </button>
              )}
            </div>
          ) : (
          <>
          <div className="flex items-center gap-1 px-3 pt-3 shrink-0 flex-wrap">
            {(
              [
                { key: "create" as const, label: "🧱 Створити" },
                { key: "page" as const, label: "📄 Сторінка" },
                {
                  key: "params" as const,
                  label: `⚙️ Параметри${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`,
                },
                { key: "complex" as const, label: "🧩 Об'єкти" },
                { key: "library" as const, label: "📚 Бібліотека" },
                { key: "links" as const, label: "🔗 Зв'язки" },
              ]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActivePanelTab(tab.key)}
                className={`flex-1 min-w-[30%] text-[11px] font-bold py-1.5 px-1 rounded-md transition-colors ${
                  activePanelTab === tab.key
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-5 pt-3">

          {activePanelTab === "page" && (
          <>
          {/* НАЛАШТУВАННЯ ПОТОЧНОЇ СТОРІНКИ */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-2">
            <span className="font-bold text-[11px] text-blue-900 uppercase block">
              📄 Налаштування сторінки:
            </span>
            <div>
              <label className="block text-[10px] text-blue-800 mb-1">Назва сторінки:</label>
              <input
                type="text"
                value={currentPage.name}
                onChange={(e) => handleUpdateCurrentPageName(e.target.value)}
                className="w-full p-1.5 border rounded-md text-xs bg-white font-semibold text-blue-900"
              />
            </div>
            <label className="text-[11px] font-bold text-blue-900 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={currentPage.meshBackground ?? false}
                onChange={(e) => handleToggleMeshBackground(e.target.checked)}
                className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              🌈 Анімований mesh-фон полотна
            </label>
            {currentPage.meshBackground && (
              <div className="pl-1 space-y-2 border-t border-blue-200 pt-2">
                <div>
                  <label className="flex items-center justify-between text-[10px] text-blue-800 mb-1">
                    <span>Швидкість:</span>
                    <span className="font-mono">{(currentPage.meshSpeed ?? 1).toFixed(1)}×</span>
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={300}
                    value={Math.round((currentPage.meshSpeed ?? 1) * 100)}
                    onChange={(e) => handleUpdateCurrentPageMeshField("meshSpeed", Number(e.target.value) / 100)}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="flex items-center justify-between text-[10px] text-blue-800 mb-1">
                    <span>Інтенсивність:</span>
                    <span className="font-mono">{Math.round(currentPage.meshIntensity ?? 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={currentPage.meshIntensity ?? 100}
                    onChange={(e) => handleUpdateCurrentPageMeshField("meshIntensity", Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-blue-800 mb-1">Кольори:</label>
                  <div className="flex gap-1">
                    {(currentPage.meshColors ?? DEFAULT_MESH_COLORS).map((c, i) => (
                      <input
                        key={i}
                        type="color"
                        value={c}
                        onChange={(e) => {
                          const next = [...(currentPage.meshColors ?? DEFAULT_MESH_COLORS)];
                          next[i] = e.target.value;
                          handleUpdateCurrentPageMeshField("meshColors", next);
                        }}
                        className="w-7 h-7 p-0 border rounded cursor-pointer"
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {pages.length > 1 && (
              <button
                onClick={handleDeleteCurrentPage}
                className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-1 rounded text-[11px] font-medium transition-colors"
              >
                🗑️ Видалити сторінку
              </button>
            )}
          </div>
          </>
          )}

          {activePanelTab === "create" && (
          <>
          {/* Створення елемента */}
          <form onSubmit={handleAddElement} className="space-y-3 pb-4 border-b">
            <h2 className="font-bold text-slate-900 text-sm">Створити елемент</h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Тип:</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ElementType)}
                  className="w-full p-1.5 border rounded-md text-xs bg-white"
                >
                  <option value="block">Блок</option>
                  <option value="heading">Заголовок</option>
                  <option value="text">Текст</option>
                  <option value="button">Кнопка</option>
                  <option value="list">Список</option>
                  <option value="clock">Годинник</option>
                  <option value="image">Зображення</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Назва:</label>
                <input
                  type="text"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  required
                  className="w-full p-1.5 border rounded-md text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Кількість (створити відразу в ряд):
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={newCount}
                onChange={(e) => setNewCount(Number(e.target.value))}
                className="w-full p-1.5 border rounded-md text-xs"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
            >
              + Створити елемент{newCount > 1 ? `и (${newCount})` : ""}
            </button>
          </form>

          {/* Ієрархія елементів */}
          <div className="space-y-2 pb-4 border-b">
            <h2 className="font-bold text-xs uppercase text-slate-500">
              Ієрархія (Поточна / Глобальна):
            </h2>
            <div className="space-y-1 text-xs">{renderSidebarTree(null)}</div>
          </div>
          </>
          )}

          {activePanelTab === "params" && (
          <>
          {/* ПАРАМЕТРИ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-sm">
                Параметри {selectedIds.length > 1 && `(${selectedIds.length})`}
              </h2>
              {selectedElements.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleDuplicateSelected}
                    className="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded text-[11px] hover:bg-blue-100 font-medium"
                    title="Дублювати (Ctrl+D)"
                  >
                    Дублювати
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    className="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded text-[11px] hover:bg-red-100 font-medium"
                  >
                    Видалити
                  </button>
                </div>
              )}
            </div>

            {selectedElements.length > 0 ? (
              <div className="space-y-4 text-xs">
                {selectedElements.length > 1 && (
                  <p className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 leading-snug">
                    🔗 Масове редагування: {selectedElements.length} об'єктів. Нижче — лише параметри, спільні для всіх (шрифт, кольори, рамка тощо); зміни застосовуються одразу до всіх виділених.
                  </p>
                )}
                {singleSelected && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Основний текст ({TYPE_LABELS[singleSelected.type]}):
                      </label>
                      <input
                        type="text"
                        value={singleSelected.content}
                        onChange={(e) => updateSelectedFields("content", e.target.value)}
                        className="w-full p-1.5 border rounded-md font-semibold text-blue-700 bg-blue-50/50"
                      />
                    </div>

                    <ParamSection
                      label="👁️ Видимість і каскад"
                      isOpen={openParamSections.has("visibility")}
                      onToggle={() => toggleParamSection("visibility")}
                      colorClass="bg-slate-50 border-slate-200 text-slate-700"
                    >
                      <div className="p-2.5 bg-violet-50/70 border border-violet-200 rounded-lg">
                        <label className="text-[11px] font-bold text-violet-900 flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={singleSelected.isGlobal ?? false}
                            onChange={(e) => updateSelectedFields("isGlobal", e.target.checked)}
                            className="rounded border-violet-300 text-violet-600 focus:ring-violet-500 h-4 w-4"
                          />
                          🌍 Показувати на всіх сторінках
                        </label>
                        {!singleSelected.isGlobal && pages.length > 1 && (
                          <div className="mt-2 pl-1 space-y-1 border-t border-violet-200 pt-2">
                            <span className="text-[10px] font-bold text-violet-700 uppercase block mb-1">
                              📌 Показувати додатково на сторінках:
                            </span>
                            {pages
                              .filter((p) => p.id !== singleSelected.pageId)
                              .map((p) => (
                                <label
                                  key={p.id}
                                  className="flex items-center gap-2 text-[11px] text-violet-800 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={singleSelected.extraPageIds?.includes(p.id) ?? false}
                                    onChange={(e) => {
                                      const current = singleSelected.extraPageIds ?? [];
                                      const next = e.target.checked
                                        ? [...current, p.id]
                                        : current.filter((id) => id !== p.id);
                                      updateSelectedFields("extraPageIds", next);
                                    }}
                                    className="rounded border-violet-300 text-violet-600 focus:ring-violet-500 h-3.5 w-3.5"
                                  />
                                  {p.name}
                                </label>
                              ))}
                          </div>
                        )}
                        {(singleSelected.isGlobal || (singleSelected.extraPageIds && singleSelected.extraPageIds.length > 0)) && (
                          <label className="mt-2 pl-1 text-[11px] font-bold text-violet-800 flex items-center gap-2 cursor-pointer border-t border-violet-200 pt-2">
                            <input
                              type="checkbox"
                              checked={singleSelected.cascadeGlobal ?? false}
                              onChange={(e) => updateSelectedFields("cascadeGlobal", e.target.checked)}
                              className="rounded border-violet-300 text-violet-600 focus:ring-violet-500 h-4 w-4"
                            />
                            🌍➡️ Каскадом на всіх вкладених (успадковують ту саму видимість)
                          </label>
                        )}
                      </div>

                      {singleSelected.parentId !== null && (
                        <div className="p-2.5 bg-rose-50/70 border border-rose-200 rounded-lg">
                          <label className="text-[11px] font-bold text-rose-900 flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={singleSelected.excludeFromCascade ?? false}
                              onChange={(e) => updateSelectedFields("excludeFromCascade", e.target.checked)}
                              className="rounded border-rose-300 text-rose-600 focus:ring-rose-500 h-4 w-4"
                            />
                            🚫 Виключити з каскаду предків (разом із вкладеними)
                          </label>
                        </div>
                      )}

                      {singleSelected.parentId !== null && (
                        <div className="p-2.5 bg-orange-50/70 border border-orange-200 rounded-lg">
                          <label className="text-[11px] font-bold text-orange-900 flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={singleSelected.excludeFromConnectionCascade ?? false}
                              onChange={(e) => updateSelectedFields("excludeFromConnectionCascade", e.target.checked)}
                              className="rounded border-orange-300 text-orange-600 focus:ring-orange-500 h-4 w-4"
                            />
                            🔗🚫 Виключити з каскаду зв'язків (разом із вкладеними)
                          </label>
                          <p className="mt-1 text-[10px] text-orange-700/70 leading-snug">
                            За замовчуванням клік на цьому елементі теж запускає зв'язки, підключені до будь-якого предка (напр. до батьківського блока). Увімкніть, щоб саме цей елемент (і все вкладене в нього) такі зв'язки більше не успадковував.
                          </p>
                        </div>
                      )}

                      <div className="p-2.5 bg-cyan-50/70 border border-cyan-200 rounded-lg">
                        <label className="text-[11px] font-bold text-cyan-900 flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={singleSelected.isTriggerTarget ?? false}
                            onChange={(e) => updateSelectedFields("isTriggerTarget", e.target.checked)}
                            className="rounded border-cyan-300 text-cyan-600 focus:ring-cyan-500 h-4 w-4"
                          />
                          👁️ Схований за замовчуванням (ціль тригера)
                        </label>
                      </div>
                    </ParamSection>
                  </>
                )}

                {/* НАЛАШТУВАННЯ ТРИГЕРІВ (HOVER ТА CLICK) — окремо для кожної сторінки:
                    та сама кнопка може на одній сторінці показувати один об'єкт,
                    на іншій — інший, а на третій — нічого не викликати взагалі. */}
                {singleSelected && (
                  <ParamSection
                    label={`⚡ Тригери появи — на сторінці «${currentPage?.name}»`}
                    isOpen={openParamSections.has("triggers")}
                    onToggle={() => toggleParamSection("triggers")}
                    colorClass="bg-indigo-50/60 border-indigo-200 text-indigo-900"
                  >
                    <div>
                      <label className="block text-[10px] text-indigo-800 mb-1">Показувати при наведенні (Hover):</label>
                      <select
                        value={getHoverTargetId(singleSelected, currentPageId) ?? ""}
                        onChange={(e) => {
                          const nextId = e.target.value === "" ? null : Number(e.target.value);
                          const nextMap = { ...(singleSelected.hoverTargetByPage ?? {}), [currentPageId]: nextId };
                          updateSelectedFields("hoverTargetByPage", nextMap);
                        }}
                        className="w-full p-1.5 border rounded-md text-xs bg-white font-medium text-indigo-900"
                      >
                        <option value="">(Немає)</option>
                        {elements
                          .filter((el) => el.id !== singleSelected.id && isVisibleOnPage(el, currentPageId))
                          .map((el) => (
                            <option key={el.id} value={el.id}>
                              [{TYPE_LABELS[el.type]}] {el.content}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-indigo-800 mb-1">Показувати при кліку (Click):</label>
                      <select
                        value={getClickTargetId(singleSelected, currentPageId) ?? ""}
                        onChange={(e) => {
                          const nextId = e.target.value === "" ? null : Number(e.target.value);
                          const nextMap = { ...(singleSelected.clickTargetByPage ?? {}), [currentPageId]: nextId };
                          updateSelectedFields("clickTargetByPage", nextMap);
                        }}
                        className="w-full p-1.5 border rounded-md text-xs bg-white font-medium text-indigo-900"
                      >
                        <option value="">(Немає)</option>
                        {elements
                          .filter((el) => el.id !== singleSelected.id && isVisibleOnPage(el, currentPageId))
                          .map((el) => (
                            <option key={el.id} value={el.id}>
                              [{TYPE_LABELS[el.type]}] {el.content}
                            </option>
                          ))}
                      </select>
                    </div>
                    <p className="text-[10px] text-indigo-700/70 leading-snug">
                      Діє лише для сторінки «{currentPage?.name}». На інших сторінках ця сама кнопка може викликати інший об'єкт або нічого.
                    </p>
                  </ParamSection>
                )}

                {/* ЧАСОВЕ ДЖЕРЕЛО — робить елемент готовим джерелом для
                    зв'язків set-year/set-month/set-week/set-day (панель
                    "🔗 Зв'язки"): замість вільного тексту дає пікер під
                    обрану одиницю, щоб не вписувати "Березень"/"2026" вручну
                    і не помилитись. Саме підключення до цілі — і далі через
                    "🔗 Зв'язки" на полотні. */}
                {singleSelected && (
                  <ParamSection
                    label="🕐 Часове джерело"
                    isOpen={openParamSections.has("timeSource")}
                    onToggle={() => toggleParamSection("timeSource")}
                    colorClass="bg-amber-50/60 border-amber-200 text-amber-900"
                  >
                    <div>
                      <label className="block text-[10px] text-amber-800 mb-1">Цей елемент — джерело:</label>
                      <select
                        value={singleSelected.timeSourceUnit ?? ""}
                        onChange={(e) => updateSelectedFields("timeSourceUnit", e.target.value || undefined)}
                        className="w-full p-1.5 border rounded-md text-xs bg-white font-medium text-amber-900"
                      >
                        <option value="">(Не часове джерело)</option>
                        <option value="year">📅 Рік</option>
                        <option value="month">📅 Місяць</option>
                        <option value="week">📅 День тижня</option>
                        <option value="day">📅 День</option>
                      </select>
                    </div>

                    {singleSelected.timeSourceUnit === "year" && (
                      <div>
                        <label className="block text-[10px] text-amber-800 mb-1">Рік:</label>
                        <input
                          type="number"
                          value={singleSelected.content}
                          onChange={(e) => updateSelectedFields("content", e.target.value)}
                          className="w-full p-1.5 border rounded-md text-xs bg-white"
                          placeholder="2026"
                        />
                      </div>
                    )}
                    {singleSelected.timeSourceUnit === "month" && (
                      <div>
                        <label className="block text-[10px] text-amber-800 mb-1">Місяць:</label>
                        <select
                          value={singleSelected.content}
                          onChange={(e) => updateSelectedFields("content", e.target.value)}
                          className="w-full p-1.5 border rounded-md text-xs bg-white"
                        >
                          <option value="">(Оберіть місяць)</option>
                          {MONTH_PILL_LABELS.map((label) => (
                            <option key={label} value={label}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {singleSelected.timeSourceUnit === "week" && (
                      <div>
                        <label className="block text-[10px] text-amber-800 mb-1">День тижня:</label>
                        <select
                          value={singleSelected.content}
                          onChange={(e) => updateSelectedFields("content", e.target.value)}
                          className="w-full p-1.5 border rounded-md text-xs bg-white"
                        >
                          <option value="">(Оберіть день тижня)</option>
                          {WEEKDAY_LABELS.map((label) => (
                            <option key={label} value={label}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {singleSelected.timeSourceUnit === "day" && (
                      <div>
                        <label className="block text-[10px] text-amber-800 mb-1">День (1–31):</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={singleSelected.content}
                          onChange={(e) => updateSelectedFields("content", e.target.value)}
                          className="w-full p-1.5 border rounded-md text-xs bg-white"
                          placeholder="15"
                        />
                      </div>
                    )}
                    {singleSelected.timeSourceUnit && (
                      <p className="text-[10px] text-amber-700/70 leading-snug">
                        Готово як джерело. Підключіть його до цілі в панелі "🔗 Зв'язки" дією "Клік на джерелі задає {TIME_UNIT_LABELS_NOM[singleSelected.timeSourceUnit]} цілі".
                      </p>
                    )}
                  </ParamSection>
                )}

                {/* ЖИВІ ЦИФРИ: Позиція та розміри */}
                <ParamSection
                  label="📏 Позиція та розміри (Live)"
                  isOpen={openParamSections.has("position")}
                  onToggle={() => toggleParamSection("position")}
                  colorClass="bg-slate-50/70 border-slate-200 text-slate-700"
                >
                  <div className="grid grid-cols-2 gap-2 pb-1 border-b border-slate-200">
                    <div className="bg-white p-1.5 border rounded shadow-2xs">
                      <span className="block text-[10px] text-slate-400 font-semibold">Позиція X:</span>
                      <span className="text-xs font-mono font-bold text-slate-800">
                        {singleSelected ? Math.round(singleSelected.x) : 0} px
                      </span>
                    </div>
                    <div className="bg-white p-1.5 border rounded shadow-2xs">
                      <span className="block text-[10px] text-slate-400 font-semibold">Позиція Y:</span>
                      <span className="text-xs font-mono font-bold text-slate-800">
                        {singleSelected ? Math.round(singleSelected.y) : 0} px
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">Ширина (W):</label>
                      <input
                        type="number"
                        min={1}
                        value={bulkSelected ? bulkSelected.width : ""}
                        onChange={(e) => updateSelectedFields("width", Number(e.target.value))}
                        className="w-full p-1.5 border rounded-md font-mono text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">Висота (H):</label>
                      <input
                        type="number"
                        min={1}
                        value={bulkSelected ? bulkSelected.height : ""}
                        onChange={(e) => updateSelectedFields("height", Number(e.target.value))}
                        className="w-full p-1.5 border rounded-md font-mono text-xs bg-white"
                      />
                    </div>
                  </div>
                </ParamSection>

                {/* ВИГЛЯД: типографіка, кольори, mesh-фон, прозорість, відступи */}
                <ParamSection
                  label="🎨 Вигляд (шрифт, кольори, фон, відступи)"
                  isOpen={openParamSections.has("appearance")}
                  onToggle={() => toggleParamSection("appearance")}
                  colorClass="bg-amber-50/60 border-amber-200 text-amber-900"
                >
                  <div>
                    <label className="block text-[10px] text-amber-800 mb-1">Шрифт (Font Family):</label>
                    <select
                      value={bulkSelected?.fontFamily || "inherit"}
                      onChange={(e) => updateSelectedFields("fontFamily", e.target.value)}
                      className="w-full p-1.5 border rounded-md text-xs bg-white font-medium"
                    >
                      <option value="inherit">За замовчуванням (System)</option>
                      <option value="sans-serif">Sans-Serif</option>
                      <option value="serif">Serif (З насічками)</option>
                      <option value="monospace">Monospace (Код)</option>
                      <option value="Inter, sans-serif">Inter</option>
                      <option value="Roboto, sans-serif">Roboto</option>
                      <option value="Georgia, serif">Georgia</option>
                      <option value="var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif">
                        ITFLight (лікарняний дашборд)
                      </option>
                      <option value="var(--font-cormorant), serif">Cormorant Garamond</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-amber-800 mb-1">Насиченість (Weight):</label>
                      <select
                        value={bulkSelected?.fontWeight || "500"}
                        onChange={(e) => updateSelectedFields("fontWeight", e.target.value)}
                        className="w-full p-1.5 border rounded-md text-xs bg-white"
                      >
                        <option value="300">Light (300)</option>
                        <option value="400">Regular (400)</option>
                        <option value="500">Medium (500)</option>
                        <option value="600">SemiBold (600)</option>
                        <option value="700">Bold (700)</option>
                        <option value="900">Black (900)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-amber-800 mb-1">Вирівнювання:</label>
                      <select
                        value={bulkSelected?.textAlign || "left"}
                        onChange={(e) => updateSelectedFields("textAlign", e.target.value)}
                        className="w-full p-1.5 border rounded-md text-xs bg-white"
                      >
                        <option value="left">Зліва</option>
                        <option value="center">По центру</option>
                        <option value="right">Справа</option>
                        <option value="justify">По ширині</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-amber-800 mb-1">Розмір шрифту (Font Size px):</label>
                    <input
                      type="number"
                      min="8"
                      max="120"
                      value={bulkSelected ? bulkSelected.fontSize ?? 12 : 12}
                      onChange={(e) => updateSelectedFields("fontSize", Number(e.target.value))}
                      className="w-full p-1.5 border rounded-md text-xs font-mono bg-white"
                    />
                  </div>

                  {/* Основні кольори */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Фон (Bg):</label>
                    <input
                      type="color"
                      value={
                        bulkSelected?.customBgColor ||
                        (bulkSelected ? getElementColor(bulkSelected) : "#2563eb")
                      }
                      onChange={(e) => updateSelectedFields("customBgColor", e.target.value)}
                      className="w-full h-7 p-0 border rounded cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Текст:</label>
                    <input
                      type="color"
                      value={bulkSelected ? bulkSelected.textColor || "#ffffff" : "#ffffff"}
                      onChange={(e) => updateSelectedFields("textColor", e.target.value)}
                      className="w-full h-7 p-0 border rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Округлення кутів самого поля (блок/список) — раніше
                    borderRadius застосовувався лише до кнопок; тепер поле
                    теж може мати заокруглені кути незалежно від "рамки".
                    Показуємо і при масовому виділенні (кілька блоків/списків
                    одразу) — updateSelectedFields однаково пише в усі. */}
                {bulkSelected && selectedElements.every((el) => el.type === "block" || el.type === "list") && (
                  <div>
                    <label className="flex items-center justify-between text-[10px] font-semibold text-slate-600 mb-1">
                      <span>Округлення кутів поля:</span>
                      <span className="font-mono text-slate-500">{bulkSelected.borderRadius ?? 0}px</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={bulkSelected.borderRadius ?? 0}
                      onChange={(e) => updateSelectedFields("borderRadius", Number(e.target.value))}
                      className="w-full cursor-pointer"
                    />
                  </div>
                )}

                {bulkSelected && selectedElements.every((el) => el.type === "block" || el.type === "list") && (
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkSelected.meshBg ?? false}
                      onChange={(e) => updateSelectedFields("meshBg", e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    🌈 Анімований mesh-фон (замість кольору вище)
                  </label>
                )}
                {bulkSelected && selectedElements.every((el) => el.type === "block" || el.type === "list") && bulkSelected.meshBg && (
                  <div className="pl-1 space-y-2 border-t border-slate-200 pt-2">
                    <div>
                      <label className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                        <span>Швидкість:</span>
                        <span className="font-mono">{(bulkSelected.meshSpeed ?? 1).toFixed(1)}×</span>
                      </label>
                      <input
                        type="range"
                        min={20}
                        max={300}
                        value={Math.round((bulkSelected.meshSpeed ?? 1) * 100)}
                        onChange={(e) => updateSelectedFields("meshSpeed", Number(e.target.value) / 100)}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                        <span>Інтенсивність:</span>
                        <span className="font-mono">{Math.round(bulkSelected.meshIntensity ?? 100)}%</span>
                      </label>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={bulkSelected.meshIntensity ?? 100}
                        onChange={(e) => updateSelectedFields("meshIntensity", Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 mb-1">Кольори:</label>
                      <div className="flex gap-1">
                        {(bulkSelected.meshColors ?? DEFAULT_MESH_COLORS).map((c, i) => (
                          <input
                            key={i}
                            type="color"
                            value={c}
                            onChange={(e) => {
                              const next = [...(bulkSelected.meshColors ?? DEFAULT_MESH_COLORS)];
                              next[i] = e.target.value;
                              updateSelectedFields("meshColors", next);
                            }}
                            className="w-7 h-7 p-0 border rounded cursor-pointer"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ДИНАМІЧНА РАМКА — перемикач + товщина + крутизна
                    експоненційного згасання прозорості на КОЖНОМУ елементі
                    окремо, тому показуємо лише коли в УСІХ виділених дійсно
                    Є батько (інакше рамці нема з чийого кольору малюватись).
                    Працює й при масовому виділенні — updateSelectedFields
                    вмикає рамку одразу всім позначеним об'єктам. */}
                {bulkSelected && selectedElements.every((el) => el.parentId !== null) && (
                  <div className="p-2.5 bg-slate-100/70 border border-slate-200 rounded-lg space-y-2">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkSelected.frame ?? false}
                        onChange={(e) => updateSelectedFields("frame", e.target.checked)}
                        className="rounded border-slate-300 text-slate-600 focus:ring-slate-500 h-4 w-4"
                      />
                      🖼️ Динамічна рамка кольору поля
                      {selectedElements.length > 1 && (
                        <span className="font-normal text-slate-400">— {selectedElements.length} об'єктів</span>
                      )}
                    </label>
                    {bulkSelected.frame && (
                      <>
                        <div>
                          <label className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                            <span>Товщина рамки:</span>
                            <span className="font-mono">{bulkSelected.frameThickness ?? 10}px</span>
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={40}
                            value={bulkSelected.frameThickness ?? 10}
                            onChange={(e) => updateSelectedFields("frameThickness", Number(e.target.value))}
                            className="w-full cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                            <span>Крутизна згасання:</span>
                            <span className="font-mono">{bulkSelected.frameFade ?? 3}</span>
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={10}
                            step={0.5}
                            value={bulkSelected.frameFade ?? 3}
                            onChange={(e) => updateSelectedFields("frameFade", Number(e.target.value))}
                            className="w-full cursor-pointer"
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug">
                          Рамка — це градієнт прозорості кольору поля: на зовнішньому краї (межа об'єкта) колір поля повний, до внутрішнього контуру (де рамка переходить в сам об'єкт) він плавно згасає в повну прозорість по експоненті. "Крутизна" — 0 дає рівномірний (лінійний) перехід, більші значення — різке згасання одразу біля краю з довгим ледь помітним хвостом. Округлення внутрішнього контуру повторює округлення самого поля (батька).
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* Прозорість фону — застосовується масово до всіх виділених елементів */}
                <div>
                  <label className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                    <span>
                      Прозорість фону {selectedIds.length > 1 && `(${selectedIds.length} об'єктів)`}:
                    </span>
                    <span className="font-mono text-slate-500">
                      {Math.round((bulkSelected?.bgOpacity ?? 1) * 100)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((bulkSelected?.bgOpacity ?? 1) * 100)}
                    onChange={(e) => updateSelectedFields("bgOpacity", Number(e.target.value) / 100)}
                    className="w-full cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Padding (px):</label>
                  <input
                    type="number"
                    value={bulkSelected ? bulkSelected.padding ?? 0 : ""}
                    onChange={(e) => updateSelectedFields("padding", Number(e.target.value))}
                    className="w-full p-1.5 border rounded-md"
                  />
                </div>
                </ParamSection>

                {/* ПУНКТИ СПИСКУ — редагування стовпців і рядків прямо в панелі */}
                {singleSelected?.type === "list" && (
                  <ParamSection
                    label="📋 Список"
                    isOpen={openParamSections.has("list")}
                    onToggle={() => toggleParamSection("list")}
                    colorClass="bg-emerald-50/60 border-emerald-200 text-emerald-900"
                  >
                    {/* Стовпці — якщо не задано жодного, рядки лишаються звичайним одним текстом */}
                    <div className="space-y-1.5 pb-2 border-b border-emerald-200">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                        Стовпці:
                      </span>
                      {(singleSelected.columns || []).map((col) => (
                        <div key={col.id} className="flex items-center gap-1">
                          <input
                            type="text"
                            value={col.label}
                            onChange={(e) => {
                              const nextColumns = (singleSelected.columns || []).map((c) =>
                                c.id === col.id ? { ...c, label: e.target.value } : c
                              );
                              updateSelectedFields("columns", nextColumns);
                            }}
                            placeholder="Назва стовпця"
                            className="flex-1 p-1 border rounded text-xs bg-white min-w-0"
                          />
                          <input
                            type="number"
                            min={1}
                            value={col.width ?? 1}
                            onChange={(e) => {
                              const nextColumns = (singleSelected.columns || []).map((c) =>
                                c.id === col.id ? { ...c, width: Number(e.target.value) } : c
                              );
                              updateSelectedFields("columns", nextColumns);
                            }}
                            title="Відносна ширина стовпця"
                            className="w-12 shrink-0 p-1 border rounded text-xs bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const nextColumns = (singleSelected.columns || []).filter((c) => c.id !== col.id);
                              updateSelectedFields("columns", nextColumns);
                            }}
                            className="shrink-0 text-red-500 hover:text-red-700 text-xs px-1.5 py-1 rounded hover:bg-red-50"
                            title="Видалити стовпець"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const nextColumns = [
                            ...(singleSelected.columns || []),
                            {
                              id: `col-${Date.now()}`,
                              label: `Стовпець ${(singleSelected.columns?.length || 0) + 1}`,
                              width: 1,
                            },
                          ];
                          updateSelectedFields("columns", nextColumns);
                        }}
                        className="w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[11px] font-medium py-1 rounded"
                      >
                        + Додати стовпець
                      </button>
                    </div>

                    {/* Рядки */}
                    <div className="space-y-1.5">
                      {elements
                        .filter(
                          (item) =>
                            item.parentId === singleSelected.id &&
                            isVisibleOnPage(item, currentPageId)
                        )
                        .map((item) => (
                          <div key={item.id} className="flex items-center gap-1.5">
                            {singleSelected.columns && singleSelected.columns.length > 0 ? (
                              <div className="flex-1 flex items-center gap-1 min-w-0">
                                {singleSelected.columns.map((col) => (
                                  <input
                                    key={col.id}
                                    type="text"
                                    value={item.columnValues?.[col.id] || ""}
                                    onChange={(e) => {
                                      const nextValues = { ...(item.columnValues || {}), [col.id]: e.target.value };
                                      const next = elements.map((el) =>
                                        el.id === item.id ? { ...el, columnValues: nextValues } : el
                                      );
                                      updateElementsAndHistory(next);
                                    }}
                                    placeholder={col.label}
                                    className="p-1 border rounded text-xs bg-white min-w-0"
                                    style={{ flexGrow: col.width ?? 1, flexBasis: 0 }}
                                  />
                                ))}
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={item.content}
                                onChange={(e) => {
                                  const next = elements.map((el) =>
                                    el.id === item.id ? { ...el, content: e.target.value } : el
                                  );
                                  updateElementsAndHistory(next);
                                }}
                                className="flex-1 p-1 border rounded text-xs bg-white"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const next = elements.filter((el) => el.id !== item.id);
                                updateElementsAndHistory(next);
                              }}
                              className="shrink-0 text-red-500 hover:text-red-700 text-xs px-1.5 py-1 rounded hover:bg-red-50"
                              title="Видалити пункт"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newItem: CanvasElement = {
                          id: Date.now(),
                          pageId: currentPageId,
                          isGlobal: false,
                          isTriggerTarget: false,
                          showOnHoverId: null,
                          showOnClickId: null,
                          type: "text",
                          content: "Новий пункт",
                          width: 120,
                          height: 30,
                          x: 1,
                          y: 1,
                          textColor: "#000000",
                          padding: 4,
                          borderRadius: 0,
                          fontSize: 13,
                          fontFamily: "var(--font-itf-light), 'Palatino', 'Palatino Linotype', serif",
                          fontWeight: "500",
                          textAlign: "left",
                          parentId: singleSelected.id,
                          targetPageId: null,
                          columnValues: singleSelected.columns
                            ? Object.fromEntries(singleSelected.columns.map((c) => [c.id, ""]))
                            : undefined,
                        };
                        updateElementsAndHistory([...elements, newItem]);
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium py-1.5 rounded"
                    >
                      + Додати пункт
                    </button>
                  </ParamSection>
                )}

                {/* ЗОБРАЖЕННЯ — джерело для type: "image" */}
                {singleSelected?.type === "image" && (
                  <ParamSection
                    label="🖼️ Зображення"
                    isOpen={openParamSections.has("image")}
                    onToggle={() => toggleParamSection("image")}
                    colorClass="bg-violet-50/60 border-violet-200 text-violet-900"
                  >
                    <div>
                      <label className="block text-[10px] text-violet-800 mb-1">URL зображення:</label>
                      <input
                        type="text"
                        value={singleSelected.imageUrl ?? ""}
                        onChange={(e) => updateSelectedFields("imageUrl", e.target.value)}
                        placeholder="/logos/khotyn.svg"
                        className="w-full p-1.5 border rounded-md text-xs font-mono"
                      />
                      <p className="mt-1 text-[10px] text-violet-700/70 leading-snug">
                        Шлях у public/ (напр. /logos/khotyn.svg) або довільний URL. Зображення вписується в межі елемента зі збереженням пропорцій (object-fit: contain).
                      </p>
                    </div>
                  </ParamSection>
                )}

                {/* ПОВНІ РАЗШИРЕНІ НАЛАШТУВАННЯ КНОПКИ (ПОВЕРНУТО) */}
                {singleSelected?.type === "button" && (
                  <ParamSection
                    label="🔘 Розширені налаштування кнопки"
                    isOpen={openParamSections.has("button")}
                    onToggle={() => toggleParamSection("button")}
                    colorClass="bg-blue-50/60 border-blue-200 text-blue-900"
                  >
                    {/* Скруглення граней */}
                    <div>
                      <label className="block text-[10px] font-semibold text-blue-800 mb-1">
                        Скруглення кутів (Border Radius px):
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={singleSelected.borderRadius ?? 8}
                        onChange={(e) => updateSelectedFields("borderRadius", Number(e.target.value))}
                        className="w-full p-1.5 border rounded-md text-xs font-mono bg-white"
                      />
                    </div>

                    {/* Перехід на сторінку */}
                    <div className="p-2 bg-white border border-blue-100 rounded-md space-y-1">
                      <label className="block text-[10px] font-bold text-emerald-900">
                        🔗 Перехід на сторінку:
                      </label>
                      <select
                        value={singleSelected.targetPageId || ""}
                        onChange={(e) => updateSelectedFields("targetPageId", e.target.value === "" ? null : e.target.value)}
                        className="w-full p-1.5 border rounded-md text-xs bg-white text-emerald-900 font-medium"
                      >
                        <option value="">(Без переходу)</option>
                        {pages.map((p) => (
                          <option key={p.id} value={p.id}>
                            Перейти на: {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* HOVER СТАН */}
                    <div className="p-2.5 bg-white border border-blue-200 rounded-md space-y-2">
                      <span className="font-bold text-[10px] text-blue-800 block border-b pb-1">
                        ✨ Наведення (Hover state):
                      </span>
                      <div>
                        <label className="block text-[10px] text-slate-600 mb-0.5">Текст при наведенні:</label>
                        <input
                          type="text"
                          value={singleSelected.hoverContent || ""}
                          placeholder={singleSelected.content}
                          onChange={(e) => updateSelectedFields("hoverContent", e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-600 mb-0.5">Фон Hover:</label>
                          <input
                            type="color"
                            value={singleSelected.hoverBgColor || "#1d4ed8"}
                            onChange={(e) => updateSelectedFields("hoverBgColor", e.target.value)}
                            className="w-full h-6 p-0 border rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-600 mb-0.5">Текст Hover:</label>
                          <input
                            type="color"
                            value={singleSelected.hoverTextColor || "#ffffff"}
                            onChange={(e) => updateSelectedFields("hoverTextColor", e.target.value)}
                            className="w-full h-6 p-0 border rounded cursor-pointer"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-600 mb-0.5">Колір сяйва:</label>
                          <input
                            type="color"
                            value={singleSelected.glowColor || "#3b82f6"}
                            onChange={(e) => updateSelectedFields("glowColor", e.target.value)}
                            className="w-full h-6 p-0 border rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-600 mb-0.5">Размитяття (px):</label>
                          <input
                            type="number"
                            value={singleSelected.glowBlur ?? 8}
                            onChange={(e) => updateSelectedFields("glowBlur", Number(e.target.value))}
                            className="w-full p-1 border rounded text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ACTIVE / TOGGLE СТАН */}
                    <div className="p-2.5 bg-white border border-indigo-200 rounded-md space-y-2">
                      <span className="font-bold text-[10px] text-indigo-800 block border-b pb-1">
                        🎯 Натискання / Активний стан (Active/Toggle):
                      </span>
                      
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-indigo-900 flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={singleSelected.isToggle ?? false}
                            onChange={(e) => updateSelectedFields("isToggle", e.target.checked)}
                            className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                          />
                          Режим Toggle
                        </label>
                        {singleSelected.isToggle && (
                          <button
                            type="button"
                            onClick={() => updateSelectedFields("isPressed", !singleSelected.isPressed)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              singleSelected.isPressed
                                ? "bg-indigo-600 text-white"
                                : "bg-indigo-200 text-indigo-800"
                            }`}
                          >
                            {singleSelected.isPressed ? "ON" : "OFF"}
                          </button>
                        )}
                      </div>

                      {singleSelected.isToggle && (
                        <label className="text-[10px] font-bold text-indigo-900 flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={singleSelected.groupExclusive ?? false}
                            onChange={(e) => updateSelectedFields("groupExclusive", e.target.checked)}
                            className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                          />
                          🔘 Групова ексклюзивність (лише одна активна в блоці, як пігулки років)
                        </label>
                      )}

                      <div>
                        <label className="block text-[10px] text-slate-600 mb-0.5">Текст у натиснутому стані:</label>
                        <input
                          type="text"
                          value={singleSelected.activeContent || ""}
                          placeholder={singleSelected.hoverContent || singleSelected.content}
                          onChange={(e) => updateSelectedFields("activeContent", e.target.value)}
                          className="w-full p-1 border rounded text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-600 mb-0.5">Фон Active:</label>
                          <input
                            type="color"
                            value={singleSelected.activeBgColor || "#1e40af"}
                            onChange={(e) => updateSelectedFields("activeBgColor", e.target.value)}
                            className="w-full h-6 p-0 border rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-600 mb-0.5">Текст Active:</label>
                          <input
                            type="color"
                            value={singleSelected.activeTextColor || "#ffffff"}
                            onChange={(e) => updateSelectedFields("activeTextColor", e.target.value)}
                            className="w-full h-6 p-0 border rounded cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-600 mb-0.5">Масштаб (Scale):</label>
                          <input
                            type="number"
                            step="0.01"
                            value={singleSelected.activeScale ?? 0.96}
                            onChange={(e) => updateSelectedFields("activeScale", Number(e.target.value))}
                            className="w-full p-1 border rounded text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-600 mb-0.5">Зсув Y (px):</label>
                          <input
                            type="number"
                            value={singleSelected.activeOffsetY ?? 1}
                            onChange={(e) => updateSelectedFields("activeOffsetY", Number(e.target.value))}
                            className="w-full p-1 border rounded text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-600 mb-0.5">Розширення W (px):</label>
                          <input
                            type="number"
                            value={singleSelected.activeWidthOffset ?? 0}
                            onChange={(e) => updateSelectedFields("activeWidthOffset", Number(e.target.value))}
                            className="w-full p-1 border rounded text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-600 mb-0.5">Розширення H (px):</label>
                          <input
                            type="number"
                            value={singleSelected.activeHeightOffset ?? 0}
                            onChange={(e) => updateSelectedFields("activeHeightOffset", Number(e.target.value))}
                            className="w-full p-1 border rounded text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </ParamSection>
                )}

              </div>
            ) : (
              <div className="p-4 text-center bg-slate-50/70 border border-dashed rounded-lg text-slate-400 text-xs">
                Виберіть елемент для налаштування
              </div>
            )}
          </div>
          </>
          )}
          {activePanelTab === "complex" && (
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto p-4">
            <div className="space-y-1.5">
              {COMPLEX_OBJECTS.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    setSelectedComplexObjectId(tpl.id);
                    setComplexObjectDraft({ ...tpl.defaults });
                  }}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                    selectedComplexObjectId === tpl.id
                      ? "bg-teal-600 border-teal-600 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-teal-50"
                  }`}
                >
                  <div className="font-bold">{tpl.label}</div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      selectedComplexObjectId === tpl.id ? "text-teal-100" : "text-slate-500"
                    }`}
                  >
                    {tpl.description}
                  </div>
                </button>
              ))}
              <button
                onClick={() => setSelectedComplexObjectId("patient-search")}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "patient-search"
                    ? "bg-rose-600 border-rose-600 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-rose-50"
                }`}
              >
                <div className="font-bold">🏥 Пошук пацієнта</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "patient-search" ? "text-rose-100" : "text-slate-500"
                  }`}
                >
                  Пошук за ПІБ/ІПН (service_role) — картка з усіма полями на полотні
                </div>
              </button>
              <button
                onClick={() => setSelectedComplexObjectId("doctor-search")}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "doctor-search"
                    ? "bg-sky-600 border-sky-600 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-sky-50"
                }`}
              >
                <div className="font-bold">👨‍⚕️ Пошук лікаря</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "doctor-search" ? "text-sky-100" : "text-slate-500"
                  }`}
                >
                  Пошук за ПІБ (mv_doctor_full, service_role) — картка з профілем і статистикою випадків
                </div>
              </button>
              <button
                onClick={() => setSelectedComplexObjectId("dept-stats-search")}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "dept-stats-search"
                    ? "bg-amber-600 border-amber-600 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-amber-50"
                }`}
              >
                <div className="font-bold">🏢 Пошук відділення (реальні дані)</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "dept-stats-search" ? "text-amber-100" : "text-slate-500"
                  }`}
                >
                  Пошук за назвою — картка з реальними випадками/летальністю/ліжко-днями, пораховано напряму з lpz.lpz_hospitalizations (v_department_stats порожній через баг)
                </div>
              </button>
              <button
                onClick={() => {
                  setSelectedComplexObjectId("hospital-org");
                  ensureOrgList();
                }}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "hospital-org"
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-indigo-50"
                }`}
              >
                <div className="font-bold">🏥 Лікарня (назва + емблема)</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "hospital-org" ? "text-indigo-100" : "text-slate-500"
                  }`}
                >
                  Довідник lpz.lpz_organizations (edrpou) — обери лікарню, додасться назва й емблема окремими пов&apos;язаними елементами
                </div>
              </button>
              <button
                onClick={() => setSelectedComplexObjectId("hospital-kpi")}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "hospital-kpi"
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-emerald-50"
                }`}
              >
                <div className="font-bold">📊 КПІ лікарні (реальні дані)</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "hospital-kpi" ? "text-emerald-100" : "text-slate-500"
                  }`}
                >
                  Один клік ставить пігулки-роки й ряд з 5 плиток (випадки/пацієнти/летальність/сер. вік/сер. ліжко-дні) — рік обираєш пігулкою на полотні, дані живі з lpz.lpz_hospitalizations
                </div>
              </button>
              <button
                onClick={() => setSelectedComplexObjectId("indicator-form")}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "indicator-form"
                    ? "bg-fuchsia-600 border-fuchsia-600 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-fuchsia-50"
                }`}
              >
                <div className="font-bold">🔢 Показник (за списком)</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "indicator-form" ? "text-fuchsia-100" : "text-slate-500"
                  }`}
                >
                  Знайди показник з довідника ЛСМД (той самий, що й у &quot;Показниках&quot;), впиши значення — і додай готову плитку в стилі &quot;Картки КПІ&quot;
                </div>
              </button>
              <button
                onClick={() => {
                  setSelectedComplexObjectId("staff-ordinatorska");
                  ensureStaffDeptList();
                }}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "staff-ordinatorska"
                    ? "bg-rose-700 border-rose-700 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-rose-50"
                }`}
              >
                <div className="font-bold">🩺 Ординаторська відділення</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "staff-ordinatorska" ? "text-rose-100" : "text-slate-500"
                  }`}
                >
                  Наближення до .docs-list сторінки завідувача (head-cabinet.css) — обери відділення, завантаж лікарів і/або пацієнтів, що зараз перебувають там; клік на рядку підсвітить і прокрутить до пов&apos;язаного рядка в іншому списку (1:1 з census-row↔doc-item зі старого проекту)
                </div>
              </button>
              <button
                onClick={() => setSelectedComplexObjectId("hierarchy-cube")}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "hierarchy-cube"
                    ? "bg-cyan-700 border-cyan-700 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-cyan-50"
                }`}
              >
                <div className="font-bold">📊 Показники (лікарня/напрямок/відділення)</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "hierarchy-cube" ? "text-cyan-100" : "text-slate-500"
                  }`}
                >
                  Обери рівень і період — 16 живих показників плитками (1 рядок) або список (кілька груп/періодів). RPC lpz_indicator_cube
                </div>
              </button>
              <button
                onClick={() => setSelectedComplexObjectId("doctor-hierarchy-cube")}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "doctor-hierarchy-cube"
                    ? "bg-cyan-700 border-cyan-700 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-cyan-50"
                }`}
              >
                <div className="font-bold">👨‍⚕️ Лікарі (обсяг, ієрархія)</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "doctor-hierarchy-cube" ? "text-cyan-100" : "text-slate-500"
                  }`}
                >
                  Випадки/пацієнти/сер. ліжко-дні по кожному лікарю, з фільтром напрямку/відділення й періодом. RPC lpz_doctor_indicator_cube
                </div>
              </button>
              <button
                onClick={() => setSelectedComplexObjectId("readmission-cube")}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "readmission-cube"
                    ? "bg-orange-700 border-orange-700 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-orange-50"
                }`}
              >
                <div className="font-bold">🔁 Повторні госпіталізації</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "readmission-cube" ? "text-orange-100" : "text-slate-500"
                  }`}
                >
                  Повторні за 30/90 днів, % і той самий діагноз. RPC lpz_readmission_cube
                </div>
              </button>
              <button
                onClick={() => setSelectedComplexObjectId("diagnosis-cube")}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "diagnosis-cube"
                    ? "bg-orange-700 border-orange-700 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-orange-50"
                }`}
              >
                <div className="font-bold">🩻 Показники по діагнозу</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "diagnosis-cube" ? "text-orange-100" : "text-slate-500"
                  }`}
                >
                  Пошук за кодом МКХ-10 (icd_primary) — випадки/пацієнти/летальність/вік/стать по діагнозу. RPC lpz_diagnosis_cube
                </div>
              </button>
              <button
                onClick={() => setSelectedComplexObjectId("patient-demo-cube")}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "patient-demo-cube"
                    ? "bg-orange-700 border-orange-700 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-orange-50"
                }`}
              >
                <div className="font-bold">🧑‍🤝‍🧑 Демографія пацієнтів</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "patient-demo-cube" ? "text-orange-100" : "text-slate-500"
                  }`}
                >
                  Стать × вікова група — випадки/пацієнти/летальність/сер. ліжко-дні. RPC lpz_patient_demo_cube
                </div>
              </button>
              <button
                onClick={() => setSelectedComplexObjectId("time-pattern-cube")}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "time-pattern-cube"
                    ? "bg-orange-700 border-orange-700 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-orange-50"
                }`}
              >
                <div className="font-bold">🕐 Часові патерни</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "time-pattern-cube" ? "text-orange-100" : "text-slate-500"
                  }`}
                >
                  Госпіталізації/смерті/нічні по годині доби, дню тижня або місяцю. RPC lpz_time_pattern_cube
                </div>
              </button>
              <button
                onClick={() => {
                  setSelectedComplexObjectId("night-shift");
                  ensureNightShiftRows();
                }}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "night-shift"
                    ? "bg-slate-700 border-slate-700 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="font-bold">🌙 Нічні чергування</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "night-shift" ? "text-slate-200" : "text-slate-500"
                  }`}
                >
                  День / Ніч — госпіталізації/пацієнти/екстрені/смерті/летальність/сер. ліжко-дні. lpz_night_vs_day_admissions
                </div>
              </button>
              <button
                onClick={() => {
                  setSelectedComplexObjectId("weekend-shift");
                  ensureWeekendShiftRows();
                }}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                  selectedComplexObjectId === "weekend-shift"
                    ? "bg-slate-700 border-slate-700 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="font-bold">🗓️ Вихідні чергування</div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    selectedComplexObjectId === "weekend-shift" ? "text-slate-200" : "text-slate-500"
                  }`}
                >
                  Вихідний / Робочий день — ті самі показники. lpz_weekend_vs_weekday
                </div>
              </button>
            </div>

            {selectedComplexObjectId === "patient-search" && (
              <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg space-y-2.5">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={patientSearchQuery}
                    onChange={(e) => setPatientSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchPatients()}
                    placeholder="ПІБ або ІПН (мін. 2 символи)…"
                    className="flex-1 p-1.5 border rounded-md text-xs"
                  />
                  <button
                    onClick={handleSearchPatients}
                    disabled={patientSearchLoading}
                    className="px-2.5 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs rounded-md shrink-0"
                  >
                    {patientSearchLoading ? "…" : "🔍"}
                  </button>
                </div>
                {patientSearchError && <div className="text-xs text-red-500 text-center py-1">{patientSearchError}</div>}
                {!selectedPatient && patientSearchResults.length > 0 && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {patientSearchResults.map((p, i) => (
                      <button
                        key={String(p.patient_id ?? i)}
                        onClick={() => setSelectedPatient(p)}
                        className="w-full text-left p-2 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-xs"
                      >
                        <div className="font-bold text-slate-700">{formatPatientFieldValue(p.full_name)}</div>
                        <div className="text-[10px] text-slate-500">
                          {formatPatientFieldValue(p.birthday)} · {formatPatientFieldValue(p.org_edrpou)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedPatient && (
                  <div className="space-y-1.5">
                    <button onClick={() => setSelectedPatient(null)} className="text-[10px] text-rose-700 hover:underline">
                      ← До результатів пошуку
                    </button>
                    <div className="border border-rose-200 bg-white rounded-lg p-2 space-y-1 max-h-56 overflow-y-auto">
                      {PATIENT_FIELD_LABELS.map((f) => (
                        <div key={f.key} className="text-[10px] flex justify-between gap-2">
                          <span className="text-slate-500 shrink-0">{f.label}:</span>
                          <span className="text-slate-800 text-right break-all">
                            {formatPatientFieldValue(selectedPatient[f.key])}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleAddPatientCard}
                      className="w-full bg-rose-700 hover:bg-rose-800 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                    >
                      ➕ Додати картку на полотно
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedComplexObjectId === "doctor-search" && (
              <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-lg space-y-2.5">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={doctorSearchQuery}
                    onChange={(e) => setDoctorSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchDoctors()}
                    placeholder="ПІБ лікаря (мін. 2 символи)…"
                    className="flex-1 p-1.5 border rounded-md text-xs"
                  />
                  <button
                    onClick={handleSearchDoctors}
                    disabled={doctorSearchLoading}
                    className="px-2.5 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs rounded-md shrink-0"
                  >
                    {doctorSearchLoading ? "…" : "🔍"}
                  </button>
                </div>
                {doctorSearchError && <div className="text-xs text-red-500 text-center py-1">{doctorSearchError}</div>}
                {!selectedDoctor && doctorSearchResults.length > 0 && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {doctorSearchResults.map((d, i) => (
                      <button
                        key={String(d.doctor_id ?? i)}
                        onClick={() => setSelectedDoctor(d)}
                        className="w-full text-left p-2 rounded-lg border border-sky-200 bg-white hover:bg-sky-50 text-xs"
                      >
                        <div className="font-bold text-slate-700">{formatLpzFieldValue(d.full_name)}</div>
                        <div className="text-[10px] text-slate-500">
                          {formatLpzFieldValue(d.position)} · {formatLpzFieldValue(d.dept_name)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedDoctor && (
                  <div className="space-y-1.5">
                    <button onClick={() => setSelectedDoctor(null)} className="text-[10px] text-sky-700 hover:underline">
                      ← До результатів пошуку
                    </button>
                    <div className="border border-sky-200 bg-white rounded-lg p-2 space-y-1 max-h-56 overflow-y-auto">
                      {DOCTOR_FIELD_LABELS.map((f) => (
                        <div key={f.key} className="text-[10px] flex justify-between gap-2">
                          <span className="text-slate-500 shrink-0">{f.label}:</span>
                          <span className="text-slate-800 text-right break-all">
                            {formatLpzFieldValue(selectedDoctor[f.key])}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleAddDoctorCard}
                      className="w-full bg-sky-700 hover:bg-sky-800 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                    >
                      ➕ Додати картку на полотно
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedComplexObjectId === "dept-stats-search" && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2.5">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={deptStatsQuery}
                    onChange={(e) => setDeptStatsQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchDeptStats()}
                    placeholder="Назва відділення (мін. 2 символи)…"
                    className="flex-1 p-1.5 border rounded-md text-xs"
                  />
                  <button
                    onClick={handleSearchDeptStats}
                    disabled={deptStatsLoading}
                    className="px-2.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs rounded-md shrink-0"
                  >
                    {deptStatsLoading ? "…" : "🔍"}
                  </button>
                </div>
                {deptStatsError && <div className="text-xs text-red-500 text-center py-1">{deptStatsError}</div>}
                {!selectedDeptStat && deptStatsResults.length > 0 && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {deptStatsResults.map((d, i) => (
                      <button
                        key={String(d.department_name ?? i)}
                        onClick={() => setSelectedDeptStat(d)}
                        className="w-full text-left p-2 rounded-lg border border-amber-200 bg-white hover:bg-amber-50 text-xs"
                      >
                        <div className="font-bold text-slate-700">{formatLpzFieldValue(d.department_name)}</div>
                        <div className="text-[10px] text-slate-500">
                          {formatLpzFieldValue(d.total_cases)} випадків · летальність {formatLpzFieldValue(d.death_rate_pct)}%
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedDeptStat && (
                  <div className="space-y-1.5">
                    <button onClick={() => setSelectedDeptStat(null)} className="text-[10px] text-amber-700 hover:underline">
                      ← До результатів пошуку
                    </button>
                    <div className="border border-amber-200 bg-white rounded-lg p-2 space-y-1 max-h-56 overflow-y-auto">
                      {DEPARTMENT_STAT_FIELD_LABELS.map((f) => (
                        <div key={f.key} className="text-[10px] flex justify-between gap-2">
                          <span className="text-slate-500 shrink-0">{f.label}:</span>
                          <span className="text-slate-800 text-right break-all">
                            {formatLpzFieldValue(selectedDeptStat[f.key])}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleAddDeptStatCard}
                      className="w-full bg-amber-700 hover:bg-amber-800 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                    >
                      ➕ Додати картку на полотно
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedComplexObjectId === "hospital-org" && (
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2.5">
                <div className="text-[10px] text-slate-500">
                  1:1 з .logo/.name-block .title (hospital-analytics, layout.css) — лого 160×160 зліва, назва праворуч (28.8px, ВЕЛИКИМИ, #3a3a3a). Окремі елементи під спільним батьком, кожен можна перев&apos;язати окремо.
                </div>
                {selectedHospital && (
                  <div className="flex items-center justify-between gap-2 p-2 bg-white border border-indigo-200 rounded-lg">
                    <div className="text-[11px]">
                      <span className="text-slate-500">Зараз активна:</span>{" "}
                      <span className="font-bold text-indigo-900">{selectedHospital.display_name}</span>
                    </div>
                    <button
                      onClick={() => setSelectedHospital(null)}
                      className="shrink-0 text-[10px] text-red-600 hover:text-red-800 hover:underline"
                      title="Скинути активну лікарню — знову з'явиться гейт вибору лікарні на панелі"
                    >
                      Скинути
                    </button>
                  </div>
                )}
                {orgListLoading && <div className="text-xs text-slate-400 text-center py-1">Завантаження…</div>}
                {!orgListLoading && orgList && orgList.length === 0 && (
                  <div className="text-xs text-red-500 text-center py-1">Не вдалося завантажити лікарні</div>
                )}
                {!orgListLoading && orgList && orgList.length > 0 && (
                  <div className="space-y-1.5">
                    {orgList.map((org) => (
                      <button
                        key={org.edrpou}
                        onClick={() => setSelectedOrg(org)}
                        className={`w-full text-left p-2 rounded-lg border text-xs transition-colors ${
                          selectedOrg?.edrpou === org.edrpou
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "border-indigo-200 bg-white hover:bg-indigo-50"
                        }`}
                      >
                        <div className="font-bold">{org.display_name}</div>
                        <div className={`text-[10px] ${selectedOrg?.edrpou === org.edrpou ? "text-indigo-100" : "text-slate-500"}`}>
                          ЄДРПОУ {org.edrpou}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedOrg && (
                  <button
                    onClick={handleAddHospitalOrgCard}
                    className="w-full bg-indigo-700 hover:bg-indigo-800 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                  >
                    ➕ Додати назву й емблему на полотно
                  </button>
                )}
              </div>
            )}

            {selectedComplexObjectId === "hospital-kpi" && (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2.5">
                <div className="text-[10px] text-slate-500">
                  Додає ряд пігулок-років (Весь час, {HOSPITAL_KPI_MIN_YEAR}…{new Date().getFullYear()}) і ряд плиток КПІ під ними, вже пов&apos;язані — клік на пігулці після додавання живцем оновлює плитки за обраний рік.
                </div>
                {hospitalKpiError && <div className="text-xs text-red-500 text-center py-1">{hospitalKpiError}</div>}
                <button
                  onClick={handleLoadHospitalKpi}
                  disabled={hospitalKpiLoading}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                >
                  {hospitalKpiLoading ? "Завантаження…" : "➕ Додати пігулки й плитки на полотно"}
                </button>
              </div>
            )}

            {selectedComplexObjectId === "indicator-form" && (
              <div className="p-3 bg-fuchsia-50/70 border border-fuchsia-200 rounded-lg space-y-2.5">
                <input
                  type="text"
                  value={indicatorFormQuery}
                  onChange={(e) => {
                    setIndicatorFormQuery(e.target.value);
                    setIndicatorFormSelected(null);
                  }}
                  placeholder="🔍 Пошук за кодом або назвою показника…"
                  className="w-full p-1.5 border rounded-md text-xs"
                />
                {!indicatorFormSelected && indicatorFormQuery.trim() && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {indicatorFormMatches.length === 0 ? (
                      <div className="text-[11px] text-slate-400 text-center py-1">Нічого не знайдено</div>
                    ) : (
                      indicatorFormMatches.map((row) => (
                        <button
                          key={`${row.sectionTitle}-${row.code}`}
                          onClick={() => setIndicatorFormSelected(row)}
                          className="w-full text-left p-2 rounded-lg border border-fuchsia-200 bg-white hover:bg-fuchsia-50 text-xs"
                        >
                          <div className="font-bold text-slate-700">{row.nameUk}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{row.code}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {indicatorFormSelected && (
                  <div className="space-y-2">
                    <button
                      onClick={() => setIndicatorFormSelected(null)}
                      className="text-[10px] text-fuchsia-700 hover:underline"
                    >
                      ← До результатів пошуку
                    </button>
                    <div className="border border-fuchsia-200 bg-white rounded-lg p-2 space-y-1">
                      <div className="text-xs font-bold text-slate-700">{indicatorFormSelected.nameUk}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{indicatorFormSelected.code}</div>
                      {indicatorFormSelected.formula && (
                        <div className="text-[10px] text-slate-400 font-mono break-all">
                          {indicatorFormSelected.formula}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                        Значення (впиши вручну — не живий запит до бази):
                      </label>
                      <input
                        type="text"
                        value={indicatorFormValue}
                        onChange={(e) => setIndicatorFormValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddIndicatorCard()}
                        placeholder="напр. 20 500 або 12,4%"
                        className="w-full p-1.5 border rounded-md text-xs"
                      />
                    </div>
                    <button
                      onClick={handleAddIndicatorCard}
                      disabled={!indicatorFormValue.trim()}
                      className="w-full bg-fuchsia-700 hover:bg-fuchsia-800 disabled:opacity-40 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                    >
                      ➕ Додати плитку на полотно
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedComplexObjectId === "staff-ordinatorska" && (
              <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg space-y-2.5">
                <input
                  type="text"
                  value={staffDeptQuery}
                  onChange={(e) => {
                    setStaffDeptQuery(e.target.value);
                    setStaffSelectedDept(null);
                  }}
                  placeholder={staffDeptListLoading ? "Завантаження списку відділень…" : "🔍 Назва відділення…"}
                  disabled={staffDeptListLoading}
                  className="w-full p-1.5 border rounded-md text-xs disabled:bg-slate-50 disabled:text-slate-400"
                />
                {!staffSelectedDept && staffDeptQuery.trim() && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {staffDeptMatches.length === 0 ? (
                      <div className="text-[11px] text-slate-400 text-center py-1">Нічого не знайдено</div>
                    ) : (
                      staffDeptMatches.map((d) => (
                        <button
                          key={d.structure_id}
                          onClick={() => setStaffSelectedDept(d)}
                          className="w-full text-left p-2 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-xs"
                        >
                          <div className="font-bold text-slate-700">{d.name}</div>
                          <div className="text-[10px] text-slate-500">{d.org_edrpou}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {staffSelectedDept && (
                  <div className="space-y-2">
                    <button
                      onClick={() => setStaffSelectedDept(null)}
                      className="text-[10px] text-rose-700 hover:underline"
                    >
                      ← До результатів пошуку
                    </button>
                    <div className="border border-rose-200 bg-white rounded-lg p-2">
                      <div className="text-xs font-bold text-slate-700">{staffSelectedDept.name}</div>
                      <div className="text-[10px] text-slate-500">{staffSelectedDept.org_edrpou}</div>
                    </div>
                    {staffError && <div className="text-xs text-red-500 text-center py-1">{staffError}</div>}
                    <button
                      onClick={handleLoadOrdinatorska}
                      disabled={staffLoading}
                      className="w-full bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                    >
                      {staffLoading ? "Завантаження…" : "➕ Завантажити ординаторську на полотно"}
                    </button>
                    {censusError && <div className="text-xs text-red-500 text-center py-1">{censusError}</div>}
                    <button
                      onClick={handleLoadCensus}
                      disabled={censusLoading}
                      className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                      title="Клік на пацієнта підсвітить і прокрутить до його лікаря в Ординаторській (і навпаки) — якщо обидва списки на полотні"
                    >
                      {censusLoading ? "Завантаження…" : "➕ Завантажити «Перебуває у відділенні»"}
                    </button>
                    <div className="text-[10px] text-slate-400">
                      Обидва списки пов&apos;язані: клік на рядку підсвітить і прокрутить до відповідного рядка в іншому списку (lpz_hospitalization_doctors.doctor_id ↔ lpz_empl.resource_id) — якщо обидва вже на полотні.
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedComplexObjectId === "hierarchy-cube" && (
              <div className="p-3 bg-cyan-50/70 border border-cyan-200 rounded-lg space-y-2.5">
                <div>
                  <label className="block text-[10px] text-cyan-900 mb-1">Рівень:</label>
                  <select
                    value={hierarchyLevel}
                    onChange={(e) => setHierarchyLevel(e.target.value as typeof hierarchyLevel)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="hospital">Лікарня</option>
                    <option value="direction">Напрямок</option>
                    <option value="department">Відділення</option>
                  </select>
                </div>
                {hierarchyLevel === "direction" && (
                  <input
                    type="text"
                    value={hierarchyDirection}
                    onChange={(e) => setHierarchyDirection(e.target.value)}
                    placeholder="Конкретний напрямок (напр. хірургічний) — або лишити пустим для всіх"
                    className="w-full p-1.5 border rounded-md text-xs"
                  />
                )}
                {hierarchyLevel === "department" && (
                  <input
                    type="text"
                    value={hierarchyDepartment}
                    onChange={(e) => setHierarchyDepartment(e.target.value)}
                    placeholder="Точна назва відділення — або лишити пустим для всіх"
                    className="w-full p-1.5 border rounded-md text-xs"
                  />
                )}
                <div>
                  <label className="block text-[10px] text-cyan-900 mb-1">Період:</label>
                  <select
                    value={hierarchyGrain}
                    onChange={(e) => setHierarchyGrain(e.target.value)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="">Весь час</option>
                    <option value="year">По роках</option>
                    <option value="month">По місяцях</option>
                    <option value="week">По тижнях</option>
                    <option value="day">По днях</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-cyan-900 mb-1">Зміна доби:</label>
                  <select
                    value={hierarchyShift}
                    onChange={(e) => setHierarchyShift(e.target.value)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="">Уся доба</option>
                    <option value="ніч">Лише нічні (22:00–07:00)</option>
                    <option value="день">Лише денні (07:00–22:00)</option>
                  </select>
                </div>
                <div className="text-[10px] text-slate-400">
                  Один рядок (лікарня/весь час) → 16 плиток. Кілька рядків (декілька відділень чи розбивка по періоду) → список.
                </div>
                <button
                  onClick={handleLoadHierarchy}
                  disabled={hierarchyLoading}
                  className="w-full bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                >
                  {hierarchyLoading ? "Завантаження…" : "➕ Завантажити на полотно"}
                </button>

                <div className="pt-2 border-t border-cyan-200 space-y-1.5">
                  <div className="text-[10px] font-bold text-cyan-900">🔗 Показник → картка</div>
                  <div className="text-[10px] text-slate-400">
                    Виділи на полотні порожню «📊 Картку КПІ» (число чи підпис), обери показник і прив&apos;яжи — рівень/напрямок/відділення вище фіксуються одразу, період підключиш окремо через «🔗 Зв&apos;язки».
                  </div>
                  <select
                    value={hierarchyBindField}
                    onChange={(e) => setHierarchyBindField(e.target.value)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="">Оберіть показник…</option>
                    {HIERARCHY_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const field = HIERARCHY_FIELDS.find((f) => f.key === hierarchyBindField);
                      if (!field) return;
                      handleBindLiveIndicator("hierarchy", field, {
                        level: hierarchyLevel,
                        direction: hierarchyDirection.trim(),
                        department: hierarchyDepartment.trim(),
                        shift: hierarchyShift,
                      });
                    }}
                    disabled={!hierarchyBindField}
                    className="w-full bg-white hover:bg-cyan-100 disabled:opacity-50 text-cyan-800 font-medium py-1.5 rounded-md text-xs border border-cyan-300"
                  >
                    🔗 Прив&apos;язати до вибраної картки
                  </button>
                </div>

                {renderChartAdderSection(
                  "cyan",
                  HIERARCHY_FIELDS,
                  hierarchyChartKind,
                  setHierarchyChartKind,
                  hierarchyChartField,
                  setHierarchyChartField,
                  hierarchyChartFieldY,
                  setHierarchyChartFieldY,
                  handleAddHierarchyChart
                )}
              </div>
            )}

            {selectedComplexObjectId === "doctor-hierarchy-cube" && (
              <div className="p-3 bg-cyan-50/70 border border-cyan-200 rounded-lg space-y-2.5">
                <input
                  type="text"
                  value={doctorHierDirection}
                  onChange={(e) => setDoctorHierDirection(e.target.value)}
                  placeholder="Напрямок (опційно)"
                  className="w-full p-1.5 border rounded-md text-xs"
                />
                <input
                  type="text"
                  value={doctorHierDepartment}
                  onChange={(e) => setDoctorHierDepartment(e.target.value)}
                  placeholder="Відділення (опційно)"
                  className="w-full p-1.5 border rounded-md text-xs"
                />
                <div>
                  <label className="block text-[10px] text-cyan-900 mb-1">Період:</label>
                  <select
                    value={doctorHierGrain}
                    onChange={(e) => setDoctorHierGrain(e.target.value)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="">Весь час</option>
                    <option value="year">По роках</option>
                    <option value="month">По місяцях</option>
                    <option value="week">По тижнях</option>
                    <option value="day">По днях</option>
                  </select>
                </div>
                <div className="text-[10px] text-slate-400">
                  Без фільтрів — усі лікарі одразу (список). Без деталізації по періоду — можна багато рядків.
                </div>
                <button
                  onClick={handleLoadDoctorHierarchy}
                  disabled={doctorHierLoading}
                  className="w-full bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                >
                  {doctorHierLoading ? "Завантаження…" : "➕ Завантажити на полотно"}
                </button>

                <div className="pt-2 border-t border-cyan-200 space-y-1.5">
                  <div className="text-[10px] font-bold text-cyan-900">🔗 Показник → картка</div>
                  <div className="text-[10px] text-slate-400">
                    Напрямок/відділення вище фіксуються одразу. Конкретного лікаря тут НЕМА вибору — підключи до картки 👨‍⚕️ лікарський вузол (рядок «🩺 Ординаторська») через «🔗 Зв&apos;язки», дія «задає ЛІКАРЯ цілі», і окремо часове джерело — без обох число лишиться «—».
                  </div>
                  <select
                    value={doctorHierBindField}
                    onChange={(e) => setDoctorHierBindField(e.target.value)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="">Оберіть показник…</option>
                    {DOCTOR_HIER_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const field = DOCTOR_HIER_FIELDS.find((f) => f.key === doctorHierBindField);
                      if (!field) return;
                      handleBindLiveIndicator("doctor-hierarchy", field, {
                        direction: doctorHierDirection.trim(),
                        department: doctorHierDepartment.trim(),
                      });
                    }}
                    disabled={!doctorHierBindField}
                    className="w-full bg-white hover:bg-cyan-100 disabled:opacity-50 text-cyan-800 font-medium py-1.5 rounded-md text-xs border border-cyan-300"
                  >
                    🔗 Прив&apos;язати до вибраної картки
                  </button>
                </div>

                {renderChartAdderSection(
                  "cyan",
                  DOCTOR_HIER_FIELDS,
                  doctorHierChartKind,
                  setDoctorHierChartKind,
                  doctorHierChartField,
                  setDoctorHierChartField,
                  doctorHierChartFieldY,
                  setDoctorHierChartFieldY,
                  handleAddDoctorHierarchyChart
                )}
              </div>
            )}

            {selectedComplexObjectId === "readmission-cube" && (
              <div className="p-3 bg-orange-50/70 border border-orange-200 rounded-lg space-y-2.5">
                <div>
                  <label className="block text-[10px] text-orange-900 mb-1">Рівень:</label>
                  <select
                    value={readmitLevel}
                    onChange={(e) => setReadmitLevel(e.target.value as typeof readmitLevel)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="hospital">Лікарня</option>
                    <option value="direction">Напрямок (усі)</option>
                    <option value="department">Відділення (усі)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-orange-900 mb-1">Період:</label>
                  <select
                    value={readmitGrain}
                    onChange={(e) => setReadmitGrain(e.target.value)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="">Весь час</option>
                    <option value="year">По роках</option>
                    <option value="month">По місяцях</option>
                  </select>
                </div>
                <button
                  onClick={handleLoadReadmissions}
                  disabled={readmitLoading}
                  className="w-full bg-orange-700 hover:bg-orange-800 disabled:opacity-50 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                >
                  {readmitLoading ? "Завантаження…" : "➕ Завантажити на полотно"}
                </button>

                <div className="pt-2 border-t border-orange-200 space-y-1.5">
                  <div className="text-[10px] font-bold text-orange-900">🔗 Показник → картка</div>
                  {readmitLevel !== "hospital" ? (
                    <div className="text-[10px] text-amber-700">
                      Прив&apos;язка поки доступна лише для рівня «Лікарня» — на «Напрямок»/«Відділення» тут немає поля під конкретну назву, тож рядків для одного періоду вийде декілька.
                    </div>
                  ) : (
                    <>
                      <select
                        value={readmitBindField}
                        onChange={(e) => setReadmitBindField(e.target.value)}
                        className="w-full p-1.5 border rounded-md text-xs bg-white"
                      >
                        <option value="">Оберіть показник…</option>
                        {READMIT_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          const field = READMIT_FIELDS.find((f) => f.key === readmitBindField);
                          if (!field) return;
                          handleBindLiveIndicator("readmissions", field, { level: "hospital" });
                        }}
                        disabled={!readmitBindField}
                        className="w-full bg-white hover:bg-orange-100 disabled:opacity-50 text-orange-800 font-medium py-1.5 rounded-md text-xs border border-orange-300"
                      >
                        🔗 Прив&apos;язати до вибраної картки
                      </button>
                    </>
                  )}
                </div>

                {renderChartAdderSection(
                  "orange",
                  READMIT_FIELDS,
                  readmitChartKind,
                  setReadmitChartKind,
                  readmitChartField,
                  setReadmitChartField,
                  readmitChartFieldY,
                  setReadmitChartFieldY,
                  handleAddReadmissionsChart
                )}
              </div>
            )}

            {selectedComplexObjectId === "diagnosis-cube" && (
              <div className="p-3 bg-orange-50/70 border border-orange-200 rounded-lg space-y-2.5">
                <input
                  type="text"
                  value={diagnosisIcd}
                  onChange={(e) => setDiagnosisIcd(e.target.value)}
                  placeholder="Код МКХ-10 (напр. I63) — або пусто для топ-30"
                  className="w-full p-1.5 border rounded-md text-xs"
                />
                <div>
                  <label className="block text-[10px] text-orange-900 mb-1">Зміна доби:</label>
                  <select
                    value={diagnosisShift}
                    onChange={(e) => setDiagnosisShift(e.target.value)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="">Уся доба</option>
                    <option value="ніч">Лише нічні (22:00–07:00)</option>
                    <option value="день">Лише денні (07:00–22:00)</option>
                  </select>
                </div>
                <button
                  onClick={handleLoadDiagnoses}
                  disabled={diagnosisLoading}
                  className="w-full bg-orange-700 hover:bg-orange-800 disabled:opacity-50 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                >
                  {diagnosisLoading ? "Завантаження…" : "➕ Завантажити на полотно"}
                </button>

                <div className="pt-2 border-t border-orange-200 space-y-1.5">
                  <div className="text-[10px] font-bold text-orange-900">🔗 Показник → картка</div>
                  <div className="text-[10px] text-slate-400">
                    {diagnosisIcd.trim()
                      ? "Код МКХ-10 вище фіксується одразу."
                      : "Код МКХ-10 не вказано — підключи до картки 🩻 діагностичний вузол (рядок «Показники по діагнозу», завантажений без фільтра) через «🔗 Зв'язки», дія «задає МКХ-10 цілі», інакше число лишиться «—»."}
                  </div>
                  <select
                    value={diagnosisBindField}
                    onChange={(e) => setDiagnosisBindField(e.target.value)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="">Оберіть показник…</option>
                    {DIAGNOSIS_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const field = DIAGNOSIS_FIELDS.find((f) => f.key === diagnosisBindField);
                      if (!field) return;
                      handleBindLiveIndicator("diagnoses", field, { icd: diagnosisIcd.trim(), shift: diagnosisShift });
                    }}
                    disabled={!diagnosisBindField}
                    className="w-full bg-white hover:bg-orange-100 disabled:opacity-50 text-orange-800 font-medium py-1.5 rounded-md text-xs border border-orange-300"
                  >
                    🔗 Прив&apos;язати до вибраної картки
                  </button>
                </div>

                {renderChartAdderSection(
                  "orange",
                  DIAGNOSIS_FIELDS,
                  diagnosisChartKind,
                  setDiagnosisChartKind,
                  diagnosisChartField,
                  setDiagnosisChartField,
                  diagnosisChartFieldY,
                  setDiagnosisChartFieldY,
                  handleAddDiagnosisChart
                )}
              </div>
            )}

            {selectedComplexObjectId === "patient-demo-cube" && (
              <div className="p-3 bg-orange-50/70 border border-orange-200 rounded-lg space-y-2.5">
                <div>
                  <label className="block text-[10px] text-orange-900 mb-1">Період:</label>
                  <select
                    value={patientDemoGrain}
                    onChange={(e) => setPatientDemoGrain(e.target.value)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="">Весь час</option>
                    <option value="year">По роках</option>
                  </select>
                </div>
                <button
                  onClick={handleLoadPatientDemo}
                  disabled={patientDemoLoading}
                  className="w-full bg-orange-700 hover:bg-orange-800 disabled:opacity-50 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                >
                  {patientDemoLoading ? "Завантаження…" : "➕ Завантажити на полотно"}
                </button>

                {renderChartAdderSection(
                  "orange",
                  PATIENT_DEMO_FIELDS,
                  patientDemoChartKind,
                  setPatientDemoChartKind,
                  patientDemoChartField,
                  setPatientDemoChartField,
                  patientDemoChartFieldY,
                  setPatientDemoChartFieldY,
                  handleAddPatientDemoChart
                )}
              </div>
            )}

            {selectedComplexObjectId === "time-pattern-cube" && (
              <div className="p-3 bg-orange-50/70 border border-orange-200 rounded-lg space-y-2.5">
                <div>
                  <label className="block text-[10px] text-orange-900 mb-1">Групувати по:</label>
                  <select
                    value={timePatternBucket}
                    onChange={(e) => setTimePatternBucket(e.target.value as typeof timePatternBucket)}
                    className="w-full p-1.5 border rounded-md text-xs bg-white"
                  >
                    <option value="hour">Годині доби</option>
                    <option value="weekday">Дню тижня</option>
                    <option value="month">Місяцю</option>
                  </select>
                </div>
                <button
                  onClick={handleLoadTimePatterns}
                  disabled={timePatternLoading}
                  className="w-full bg-orange-700 hover:bg-orange-800 disabled:opacity-50 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                >
                  {timePatternLoading ? "Завантаження…" : "➕ Завантажити на полотно"}
                </button>

                {renderChartAdderSection(
                  "orange",
                  TIME_PATTERN_FIELDS,
                  timePatternChartKind,
                  setTimePatternChartKind,
                  timePatternChartField,
                  setTimePatternChartField,
                  timePatternChartFieldY,
                  setTimePatternChartFieldY,
                  handleAddTimePatternChart
                )}
              </div>
            )}

            {selectedComplexObjectId === "night-shift" && (
              <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg space-y-2.5">
                <div className="text-[10px] text-slate-500">
                  Обери День чи Ніч — додасть 6 плиток у стилі &quot;Картки КПІ&quot; з живими даними саме для цього періоду доби.
                </div>
                {nightShiftLoading && <div className="text-xs text-slate-400 text-center py-1">Завантаження…</div>}
                {nightShiftError && <div className="text-xs text-red-500 text-center py-1">{nightShiftError}</div>}
                {!nightShiftLoading && nightShiftRows && nightShiftRows.length > 0 && (
                  <div className="space-y-1.5">
                    {nightShiftRows.map((row) => (
                      <button
                        key={row.time_period}
                        onClick={() => handleAddNightShiftCard(row)}
                        className="w-full text-left p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs"
                      >
                        <div className="font-bold">{row.time_period}</div>
                        <div className="text-[10px] text-slate-500">
                          {row.cases} госпіталізацій · летальність {row.letality_percent}%
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedComplexObjectId === "weekend-shift" && (
              <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg space-y-2.5">
                <div className="text-[10px] text-slate-500">
                  Обери Вихідний чи Робочий день — додасть 6 плиток у стилі &quot;Картки КПІ&quot; з живими даними саме для цього типу дня.
                </div>
                {weekendShiftLoading && <div className="text-xs text-slate-400 text-center py-1">Завантаження…</div>}
                {weekendShiftError && <div className="text-xs text-red-500 text-center py-1">{weekendShiftError}</div>}
                {!weekendShiftLoading && weekendShiftRows && weekendShiftRows.length > 0 && (
                  <div className="space-y-1.5">
                    {weekendShiftRows.map((row) => (
                      <button
                        key={row.day_type}
                        onClick={() => handleAddWeekendShiftCard(row)}
                        className="w-full text-left p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs"
                      >
                        <div className="font-bold">{row.day_type}</div>
                        <div className="text-[10px] text-slate-500">
                          {row.cases} госпіталізацій · летальність {row.letality_percent}%
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Власні складні об'єкти — зібрані з простих фігур на полотні
                (прямокутник, текст тощо), той самий принцип збереження, що
                й у "Бібліотеці": виділити → зберегти під назвою → додавати
                повторно. handleAddLibraryItem/renderLibraryItemTree тут
                свідомо переюзані — вони вже узагальнені (працюють з будь-
                яким { id, name, elements, rootIds }), а не прив'язані до
                самого списку libraryItems. Розташовано ПІСЛЯ всіх форм
                пошуку/завантаження (а не одразу під списком кнопок) — інакше
                кожна нова спеціальна форма (Пошук лікаря, Ординаторська…)
                опинялася б усе нижче й нижче під цим (потенційно довгим)
                списком, і її не було б видно без прокрутки. */}
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <div className="text-[10px] text-slate-400">
                Свій складний об&apos;єкт — зберіть його з простих фігур на полотні (прямокутник, текст тощо), виділіть і збережіть тут.
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={complexObjectNameDraft}
                  onChange={(e) => setComplexObjectNameDraft(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleSaveSelectionAsComplexObject(complexObjectNameDraft)
                  }
                  placeholder={
                    selectedIds.length === 0 ? "Виділіть елемент(и) на полотні…" : "Назва складного об'єкта…"
                  }
                  disabled={selectedIds.length === 0}
                  className="flex-1 p-1.5 border rounded-md text-xs disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                  onClick={() => handleSaveSelectionAsComplexObject(complexObjectNameDraft)}
                  disabled={selectedIds.length === 0 || !complexObjectNameDraft.trim()}
                  className="px-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-xs rounded-md shrink-0"
                  title="Зберегти виділене як складний об'єкт"
                >
                  💾
                </button>
              </div>
              {customComplexObjects.length === 0 ? (
                <div className="p-3 text-center bg-slate-50/70 border border-dashed rounded-lg text-slate-400 text-[11px]">
                  Поки немає власних складних об&apos;єктів.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {customComplexObjects.map((item) => {
                    const isOpen = openCustomComplexObjectIds.has(item.id);
                    const hasStructure = item.elements.length > 1;
                    return (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                        <div className="p-2 flex items-center gap-2">
                          {hasStructure ? (
                            <button
                              type="button"
                              onClick={() => toggleCustomComplexObjectOpen(item.id)}
                              className="shrink-0 w-3.5 text-center text-[10px] text-slate-400"
                              title={isOpen ? "Згорнути склад" : "Показати склад"}
                            >
                              {isOpen ? "▼" : "▶"}
                            </button>
                          ) : (
                            <span className="shrink-0 w-3.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-slate-700 truncate">{item.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {item.rootIds.length > 1 ? `${item.rootIds.length} елем.` : "1 елемент"}
                              {item.elements.length > item.rootIds.length
                                ? ` + ${item.elements.length - item.rootIds.length} вклад.`
                                : ""}
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddLibraryItem(item)}
                            className="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white text-[11px] rounded-md shrink-0"
                            title="Додати на полотно"
                          >
                            ➕
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Видалити «${item.name}» зі складних об'єктів?`))
                                handleDeleteCustomComplexObject(item.id);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 text-[11px] rounded-md shrink-0"
                            title="Видалити"
                          >
                            🗑
                          </button>
                        </div>
                        {isOpen && hasStructure && (
                          <div className="px-2 pb-2 pt-1 border-t border-slate-100 bg-slate-50/60">
                            {renderLibraryItemTree(item)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedComplexObjectId &&
              selectedComplexObjectId !== "patient-search" &&
              selectedComplexObjectId !== "doctor-search" &&
              selectedComplexObjectId !== "dept-stats-search" &&
              selectedComplexObjectId !== "hospital-org" &&
              selectedComplexObjectId !== "hospital-kpi" &&
              selectedComplexObjectId !== "indicator-form" &&
              selectedComplexObjectId !== "staff-ordinatorska" &&
              selectedComplexObjectId !== "hierarchy-cube" &&
              selectedComplexObjectId !== "doctor-hierarchy-cube" &&
              selectedComplexObjectId !== "readmission-cube" &&
              selectedComplexObjectId !== "diagnosis-cube" &&
              selectedComplexObjectId !== "patient-demo-cube" &&
              selectedComplexObjectId !== "time-pattern-cube" &&
              selectedComplexObjectId !== "night-shift" &&
              selectedComplexObjectId !== "weekend-shift" &&
              (() => {
                const template = COMPLEX_OBJECTS.find((t) => t.id === selectedComplexObjectId)!;
                // Редагування вже існуючої кнопки на полотні (обрана через
                // клік/дерево) — поля показують і одразу правлять її РЕАЛЬНІ
                // значення (updateSelectedFields), а не чернетку для створення.
                const editingEl = singleSelected?.type === "button" ? singleSelected : null;

                const getFieldValue = (field: ComplexObjectField) =>
                  editingEl
                    ? ((editingEl[field.key] as any) ?? (field.type === "number" ? 0 : "#000000"))
                    : ((complexObjectDraft[field.key] as any) ??
                      (template.defaults[field.key] as any) ??
                      (field.type === "number" ? 0 : "#000000"));

                const setFieldValue = (field: ComplexObjectField, raw: string) => {
                  const value = field.type === "number" ? Number(raw) : raw;
                  if (editingEl) {
                    updateSelectedFields(field.key, value);
                  } else {
                    setComplexObjectDraft((prev) => ({ ...prev, [field.key]: value }));
                  }
                };

                const groupExclusiveValue = editingEl
                  ? editingEl.groupExclusive ?? false
                  : complexObjectDraft.groupExclusive ?? false;

                const setGroupExclusive = (checked: boolean) => {
                  if (editingEl) {
                    updateSelectedFields("groupExclusive", checked);
                    if (checked && !editingEl.isToggle) updateSelectedFields("isToggle", true);
                  } else {
                    setComplexObjectDraft((prev) => ({
                      ...prev,
                      groupExclusive: checked,
                      isToggle: checked ? true : prev.isToggle,
                    }));
                  }
                };

                return (
                  <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-lg space-y-2.5">
                    <span className="font-bold text-[11px] text-teal-900 uppercase block">
                      {editingEl ? `✏️ Редагування: «${editingEl.content}»` : "⚙️ Налаштування:"}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {template.fields.map((field) => (
                        <div key={String(field.key)}>
                          <label className="block text-[10px] text-teal-800 mb-1">{field.label}:</label>
                          <input
                            type={field.type}
                            value={getFieldValue(field)}
                            onChange={(e) => setFieldValue(field, e.target.value)}
                            className={
                              field.type === "color"
                                ? "w-full h-7 p-0 border rounded cursor-pointer"
                                : "w-full p-1.5 border rounded-md text-xs font-mono bg-white"
                            }
                          />
                        </div>
                      ))}
                    </div>

                    <label className="text-[11px] font-bold text-teal-900 flex items-center gap-2 cursor-pointer pt-2 border-t border-teal-200">
                      <input
                        type="checkbox"
                        checked={groupExclusiveValue}
                        onChange={(e) => setGroupExclusive(e.target.checked)}
                        className="rounded border-teal-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
                      />
                      🔘 Групова ексклюзивність
                    </label>

                    {!editingEl && (
                      <button
                        onClick={handleAddComplexObject}
                        className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
                      >
                        ➕ {template.groupItems ? `Додати всі ${template.groupItems.length} на полотно` : "Додати на полотно"}
                        {forcedParentId ? "" : " (у корінь сторінки)"}
                      </button>
                    )}
                  </div>
                );
              })()}
          </div>
          )}
          {activePanelTab === "library" && (
          <>
          <div className="px-2 pt-2 text-[10px] text-slate-400 shrink-0">
            Власні готові елементи — збережіть виділене на полотні під назвою, щоб вставляти його повторно.
          </div>
          <div className="p-2 border-b border-slate-200 shrink-0 space-y-1.5">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={libraryNameDraft}
                onChange={(e) => setLibraryNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveSelectionToLibrary(libraryNameDraft)}
                placeholder={
                  selectedIds.length === 0 ? "Виділіть елемент(и) на полотні…" : "Назва елемента бібліотеки…"
                }
                disabled={selectedIds.length === 0}
                className="flex-1 p-1.5 border rounded-md text-xs disabled:bg-slate-50 disabled:text-slate-400"
              />
              <button
                onClick={() => handleSaveSelectionToLibrary(libraryNameDraft)}
                disabled={selectedIds.length === 0 || !libraryNameDraft.trim()}
                className="px-2.5 bg-violet-700 hover:bg-violet-800 disabled:opacity-40 text-white text-xs rounded-md shrink-0"
                title="Зберегти виділене в бібліотеку"
              >
                💾
              </button>
            </div>
            {selectedIds.length > 0 && (
              <div className="text-[10px] text-slate-400">
                Буде збережено: {selectedIds.length} {selectedIds.length === 1 ? "елемент" : "елем."} (з нащадками)
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {libraryItems.length === 0 && (
              <div className="p-3 text-center bg-slate-50/70 border border-dashed rounded-lg text-slate-400 text-[11px]">
                Бібліотека порожня. Виділіть елемент на полотні й збережіть його вище.
              </div>
            )}
            {libraryItems.map((item) => {
              const isOpen = openLibraryItemIds.has(item.id);
              const hasStructure = item.elements.length > 1;
              return (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <div className="p-2 flex items-center gap-2">
                    {hasStructure ? (
                      <button
                        type="button"
                        onClick={() => toggleLibraryItemOpen(item.id)}
                        className="shrink-0 w-3.5 text-center text-[10px] text-slate-400"
                        title={isOpen ? "Згорнути склад" : "Показати склад"}
                      >
                        {isOpen ? "▼" : "▶"}
                      </button>
                    ) : (
                      <span className="shrink-0 w-3.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-700 truncate">{item.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {item.rootIds.length > 1 ? `${item.rootIds.length} елем.` : "1 елемент"}
                        {item.elements.length > item.rootIds.length
                          ? ` + ${item.elements.length - item.rootIds.length} вклад.`
                          : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddLibraryItem(item)}
                      className="px-2 py-1 bg-violet-600 hover:bg-violet-700 text-white text-[11px] rounded-md shrink-0"
                      title="Додати на полотно"
                    >
                      ➕
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Видалити «${item.name}» з бібліотеки?`)) handleDeleteLibraryItem(item.id);
                      }}
                      className="px-2 py-1 bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 text-[11px] rounded-md shrink-0"
                      title="Видалити з бібліотеки"
                    >
                      🗑
                    </button>
                  </div>
                  {isOpen && hasStructure && (
                    <div className="px-2 pb-2 pt-1 border-t border-slate-100 bg-slate-50/60">
                      {renderLibraryItemTree(item)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
          )}

          {activePanelTab === "links" && (
          <>
          <div className="px-2 pt-2 text-[10px] text-slate-400 shrink-0">
            Інтерактивні зв'язки між елементами полотна — джерело → ціль. Що саме зв'язок робить, приписується окремим кроком пізніше.
          </div>
          <div className="p-2 border-b border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => {
                setLinkMode((prev) => !prev);
                setPendingLinkSourceId(null);
              }}
              className={`w-full py-1.5 text-xs font-bold rounded-md transition-colors ${
                linkMode
                  ? "bg-fuchsia-700 hover:bg-fuchsia-800 text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              {linkMode ? "🔗 Режим з'єднання: УВІМКНЕНО" : "🔗 Увімкнути режим з'єднання"}
            </button>
            {linkMode && (
              <p className="mt-1.5 text-[10px] text-fuchsia-700 leading-snug">
                {pendingLinkSourceId === null
                  ? "Клікніть на елемент-джерело на полотні."
                  : "Тепер клікніть на елемент-ціль (або ще раз на джерело, щоб скасувати)."}
              </p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {connections.length === 0 && (
              <div className="p-3 text-center bg-slate-50/70 border border-dashed rounded-lg text-slate-400 text-[11px]">
                Зв'язків ще немає. Увімкніть режим з'єднання й клікніть по двох елементах на полотні.
              </div>
            )}
            {connections.map((conn) => {
              const fromEl = elements.find((item) => item.id === conn.fromId);
              const toEl = elements.find((item) => item.id === conn.toId);
              return (
                <div key={conn.id} className="rounded-lg border border-slate-200 bg-white p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 text-xs text-slate-700 truncate">
                      <span className="font-bold">{fromEl ? fromEl.content : "?"}</span>
                      <span className="mx-1 text-slate-400">→</span>
                      <span className="font-bold">{toEl ? toEl.content : "?"}</span>
                    </div>
                    <button
                      onClick={() => updateConnectionsAndHistory(connections.filter((c) => c.id !== conn.id))}
                      className="px-2 py-1 bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 text-[11px] rounded-md shrink-0"
                      title="Видалити зв'язок"
                    >
                      🗑
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold">Функції (можна кілька):</div>
                  <div className="space-y-1">
                    {CONNECTION_ACTION_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex items-start gap-1.5 text-[11px] text-slate-700 cursor-pointer leading-snug"
                      >
                        <input
                          type="checkbox"
                          checked={conn.actions?.includes(opt.value) ?? false}
                          onChange={() => toggleConnectionAction(conn.id, opt.value)}
                          className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 h-3.5 w-3.5 shrink-0"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  {conn.actions && conn.actions.some((a) => a.startsWith("set-")) && (
                    <p className="text-[10px] text-slate-400 leading-snug">
                      Текст джерела («{fromEl?.content ?? "?"}») стане{" "}
                      {conn.actions
                        .filter((a) => a.startsWith("set-"))
                        .map((a) => TIME_UNIT_LABELS_INSTR[a.replace("set-", "") as "year" | "month" | "week" | "day"])
                        .join(" і ")}{" "}
                      цілі. Підключіть ще зв'язки з інших часових елементів (рік/місяць/тиждень/день) до тієї самої цілі — складуться разом.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          </>
          )}
          </div>
          </>
          )}
          </>
          )}
        </aside>
        </Rnd>

        {/* Плаваюча панель "📖 Довідники" — Показники й Підключення до бази,
            обидві суто довідкові (не додають нічого на полотно), об'єднані
            вкладками в одну панель замість двох окремих вікон. */}
        <Rnd
          position={refsPanelPos}
          size={refsPanelCollapsed ? { width: refsPanelSize.width, height: 44 } : refsPanelSize}
          onDragStop={(e, d) => setRefsPanelPos({ x: d.x, y: d.y })}
          onResizeStop={(e, dir, ref, delta, pos) => {
            setRefsPanelSize({ width: parseInt(ref.style.width), height: parseInt(ref.style.height) });
            setRefsPanelPos(pos);
          }}
          dragHandleClassName="refs-panel-drag-handle"
          bounds="window"
          minWidth={260}
          minHeight={refsPanelCollapsed ? 44 : 200}
          enableResizing={!refsPanelCollapsed}
          style={{ zIndex: 45 }}
        >
        <aside
          className="w-full h-full backdrop-blur-sm rounded-xl border border-slate-200 shadow-lg flex flex-col overflow-hidden"
          style={{ backgroundColor: `rgba(255, 255, 255, ${refsPanelOpacity})` }}
        >
          <div className="refs-panel-drag-handle cursor-move bg-indigo-900/80 text-white text-[11px] font-bold px-3 py-2 rounded-t-xl flex items-center justify-between gap-2 shrink-0 select-none">
            <span>⠿ 📖 Довідники</span>
            <div className="flex items-center gap-2 font-normal">
              <div
                className="flex items-center gap-1.5"
                onMouseDown={(e) => e.stopPropagation()}
                title="Прозорість панелі"
              >
                <span>👁️</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(refsPanelOpacity * 100)}
                  onChange={(e) => setRefsPanelOpacity(Number(e.target.value) / 100)}
                  className="w-16 cursor-pointer"
                />
              </div>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setRefsPanelCollapsed((prev) => !prev)}
                className="text-xs leading-none hover:text-slate-300 shrink-0"
                title={refsPanelCollapsed ? "Розгорнути панель" : "Згорнути панель"}
              >
                {refsPanelCollapsed ? "▶" : "▼"}
              </button>
            </div>
          </div>
          {!refsPanelCollapsed && (
          <>
          <div className="flex items-center gap-1 px-3 pt-3 shrink-0">
            {(
              [
                { key: "indicators" as const, label: "📖 Показники" },
                { key: "connections" as const, label: "🔌 Підключення" },
              ]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRefsActiveTab(tab.key)}
                className={`flex-1 text-[11px] font-bold py-1.5 rounded-md transition-colors ${
                  refsActiveTab === tab.key
                    ? "bg-indigo-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {refsActiveTab === "indicators" && (
          <>
          <div className="p-2 border-b border-slate-200 shrink-0">
            <input
              type="text"
              value={indicatorSearch}
              onChange={(e) => setIndicatorSearch(e.target.value)}
              placeholder="🔍 Пошук за кодом або назвою…"
              className="w-full p-1.5 border rounded-md text-xs"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredIndicatorSections.length === 0 && (
              <div className="text-xs text-slate-400 text-center py-4">Нічого не знайдено</div>
            )}
            {filteredIndicatorSections.map((section) => {
              const isOpen = normalizedIndicatorSearch ? true : openIndicatorSections.has(section.title);
              return (
                <div key={section.title} className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleIndicatorSection(section.title)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-left"
                  >
                    <span className="text-[11px] font-bold text-slate-700">
                      {isOpen ? "▼" : "▶"} {section.title}
                    </span>
                    <span className="text-[10px] text-slate-400">{section.rows.length}</span>
                  </button>
                  {section.source && isOpen && (
                    <div className="px-2 pt-1 text-[10px] text-slate-400 italic">{section.source}</div>
                  )}
                  {isOpen && (
                    <div className="divide-y divide-slate-100">
                      {section.rows.map((row, idx) => (
                        <button
                          key={`${row.code}-${idx}`}
                          onClick={() => handleCopyIndicatorCode(row.code)}
                          title="Копіювати код"
                          className="w-full text-left px-2 py-1.5 hover:bg-indigo-50 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <code className="text-[11px] font-mono text-indigo-700">{row.code}</code>
                            {copiedIndicatorCode === row.code && (
                              <span className="text-[10px] text-emerald-600 font-semibold">скопійовано ✓</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-600">{row.nameUk}</div>
                          {row.formula && (
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5 break-all">{row.formula}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
          )}
          {refsActiveTab === "connections" && (
          <>
          <div className="px-2 pt-2 text-[10px] text-slate-400 shrink-0">
            Довідник способів API-доступу до Supabase — без секретів, лише опис і де саме в проєкті використано.
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {API_CONNECTION_VARIANTS.map((variant) => {
              const isOpen = openConnectionIds.has(variant.id);
              return (
                <div key={variant.id} className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleConnectionOpen(variant.id)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-left"
                  >
                    <span className="text-[11px] font-bold text-slate-700">
                      {isOpen ? "▼" : "▶"} {variant.title}
                    </span>
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                        variant.status === "used" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {variant.status === "used" ? "використовується" : "доступно"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="p-2 space-y-1.5 text-[10px] text-slate-600">
                      <span className={`inline-block font-semibold px-1.5 py-0.5 rounded-full ${SCOPE_BADGE_STYLE[variant.scope]}`}>
                        {SCOPE_LABELS[variant.scope]}
                      </span>
                      <div>{variant.description}</div>
                      {variant.envVars && (
                        <div className="font-mono text-slate-500">
                          {variant.envVars.map((v) => (
                            <div key={v}>• {v}</div>
                          ))}
                        </div>
                      )}
                      {variant.example && (
                        <div className="font-mono bg-slate-50 border border-slate-200 rounded p-1.5 break-all text-slate-500">
                          {variant.example}
                        </div>
                      )}
                      {variant.getTokenUrl && (
                        <a
                          href={variant.getTokenUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-indigo-600 hover:underline"
                        >
                          🔗 Де взяти ключ/токен →
                        </a>
                      )}
                      {variant.whereToAdd && <div className="text-slate-500">📥 Куди вписати: {variant.whereToAdd}</div>}
                      {variant.sqlEditorUrl && (
                        <a
                          href={variant.sqlEditorUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-indigo-600 hover:underline"
                        >
                          🛠️ SQL Editor (перевірити/змінити права) →
                        </a>
                      )}
                      {variant.note && <div className="italic text-slate-400">{variant.note}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
          )}
          </>
          )}
        </aside>
        </Rnd>

                {/* Полотно на всю сторінку */}
        <main
          onClick={() => {
            if (suppressNextCanvasClickRef.current) {
              suppressNextCanvasClickRef.current = false;
              return;
            }
            if (linkMode) {
              setPendingLinkSourceId(null);
              return;
            }
            handleSelectElement(null);
            setClickedElementId(null);
            if (linkedHighlightIds.size > 0) setLinkedHighlightIds(new Set());
          }}
          className="absolute inset-0 overflow-auto"
          style={{ backgroundColor: currentPage.meshBackground ? "#f0ece8" : "#ffffff" }}
        >
          {currentPage.meshBackground &&
            renderMeshLayer(currentPage.meshSpeed, currentPage.meshIntensity, currentPage.meshColors)}

          {/* ФОН СІТКИ (Динамічний) */}
          <div
            className="absolute inset-0 opacity-60 pointer-events-none transition-all"
            style={{
              backgroundImage: enableGrid
                ? "radial-gradient(#3b82f6 1.5px, transparent 1.5px)"
                : "radial-gradient(#e2e8f0 1px, transparent 1px)",
              backgroundSize: enableGrid ? "5px 5px" : "16px 16px",
            }}
          />
          <div className="relative w-full h-full">
            {elements
              .filter((el) => el.parentId === null && isVisibleOnPage(el, currentPageId))
              .map((el) => renderCanvasNode(el))}
            {renderConnectionsLayer()}
          </div>
        </main>
      </div>
    </div>
  );
}
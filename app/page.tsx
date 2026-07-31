"use client";

import { useState, useEffect, useRef } from "react";
import { Rnd } from "react-rnd";

type ElementType = "block" | "heading" | "text" | "button" | "list" | "clock";

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
  parentId: number | null;
  customBgColor?: string;
  bgOpacity?: number; // 0..1, прозорість фону елемента
  meshBg?: boolean; // анімований mesh-фон замість звичайного суцільного фону (перекриває customBgColor)
  meshSpeed?: number; // множник швидкості анімації (1 = дефолт, 18с/26с як в оригіналі)
  meshIntensity?: number; // 0..100, загальна непрозорість mesh-шару
  meshColors?: string[]; // 1-5 кастомних кольорів замість дефолтної палітри Хотина

  // Динамічна рамка — тільки для елементів, вкладених у батька
  // (parentId !== null). Перемикач + товщина на КОЖНОМУ елементі окремо (а
  // не властивість батька) — суцільна рамка кольору батьківського поля,
  // накладена на власні зовнішні frameThickness px елемента (поки без
  // розмиття — просто чіткий контур). Округлення кутів рамки НЕ своє —
  // береться з borderRadius самого батьківського поля (renderCanvasNode:
  // framePar?.borderRadius), щоб рамка завжди повторювала форму поля,
  // а не мала окрему розсинхронізовану ручку.
  frame?: boolean;
  frameThickness?: number; // px

  // "Список" (type: "list") — конфігурація стовпців таблиці
  columns?: ListColumn[];
  // Рядок списку (дитина list-елемента зі стовпцями) — значення по кожному стовпцю
  columnValues?: Record<string, string>;

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
}

// Повні назви місяців (називний відмінок, ВЕЛИКИМИ) — 1:1 з MONTH_PILL_NAMES
// у public/js/utils.js (пігулки місяців під роками в hospital-analytics).
const MONTH_PILL_LABELS = [
  "СІЧЕНЬ", "ЛЮТИЙ", "БЕРЕЗЕНЬ", "КВІТЕНЬ", "ТРАВЕНЬ", "ЧЕРВЕНЬ",
  "ЛИПЕНЬ", "СЕРПЕНЬ", "ВЕРЕСЕНЬ", "ЖОВТЕНЬ", "ЛИСТОПАД", "ГРУДЕНЬ",
];

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
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
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
];

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

// Обгортка для ОДНОГО вкладеного об'єкта (не для батька!) — знає лише
// "яка в мене товщина", "який колір навколо мене (фон батьківського поля)"
// і власні width/height. Суцільна рамка кольору поля, товщиною thickness
// px, накладена НА САМ об'єкт: зовнішні thickness px самого об'єкта
// перефарбовуються в колір поля, а власний вміст лишається видимим тільки
// в центрі (розширення назовні, в уже й так того ж кольору фон поля
// навколо, було б непомітним).
function ObjectFrame({
  thickness,
  color,
  radius,
  width,
  height,
}: {
  thickness: number;
  color: string;
  radius: number;
  width: number;
  height: number;
}) {
  if (thickness <= 0) return null;
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: color,
        clipPath: frameClipPath(width, height, thickness, radius),
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

  const [newType, setNewType] = useState<ElementType>("block");
  const [newContent, setNewContent] = useState<string>("Елемент");
  const [newCount, setNewCount] = useState<number>(1);
  const [forcedParentId, setForcedParentId] = useState<number | null>(null);

  // СТАНТИ: Сітка (Grid Snap) та Історія (Undo/Redo)
  const [enableGrid, setEnableGrid] = useState<boolean>(true);
  const [history, setHistory] = useState<{ pages: Page[]; elements: CanvasElement[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Позиція та розмір плаваючої панелі управління (винесена з полотна, щоб не заважала)
  const [panelPos, setPanelPos] = useState<{ x: number; y: number }>({ x: 24, y: 24 });
  const [panelSize, setPanelSize] = useState<{ width: number; height: number }>({ width: 340, height: 640 });
  const [panelOpacity, setPanelOpacity] = useState<number>(0.8);

  // Окрема плаваюча панель "Складні об'єкти" — список пресетів (пігулка тощо),
  // при виборі відкриває поля налаштувань (підсвітка/кольори/розміри), перед
  // тим як додати готовий елемент на полотно.
  const [complexPanelPos, setComplexPanelPos] = useState<{ x: number; y: number }>({ x: 380, y: 24 });
  const [complexPanelSize, setComplexPanelSize] = useState<{ width: number; height: number }>({ width: 300, height: 480 });
  const [complexPanelOpacity, setComplexPanelOpacity] = useState<number>(0.9);
  const [selectedComplexObjectId, setSelectedComplexObjectId] = useState<string | null>(null);
  const [complexObjectDraft, setComplexObjectDraft] = useState<Partial<CanvasElement>>({});

  // Які вузли ієрархії в бічній панелі згорнуті (не показують своїх дочірніх елементів)
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

  // Вкладки головної панелі управління — замість одного суцільного скролу
  // (Створити елемент + Ієрархія + Сторінка + Параметри в одному стовпці).
  // "params" відкривається автоматично при виборі елемента (див. ефект нижче).
  const [activePanelTab, setActivePanelTab] = useState<"create" | "page" | "params">("create");

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

  const saveToHistory = (newPages: Page[], newElements: CanvasElement[]) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    updatedHistory.push({ pages: newPages, elements: newElements });
    
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
    if (savedPanelPos) {
      try { setPanelPos(JSON.parse(savedPanelPos)); } catch (e) {}
    }
    if (savedPanelSize) {
      try { setPanelSize(JSON.parse(savedPanelSize)); } catch (e) {}
    }
    if (savedPanelOpacity) {
      try { setPanelOpacity(JSON.parse(savedPanelOpacity)); } catch (e) {}
    }

    const savedComplexPanelPos = localStorage.getItem("mis_canvas_complex_panel_pos");
    const savedComplexPanelSize = localStorage.getItem("mis_canvas_complex_panel_size");
    const savedComplexPanelOpacity = localStorage.getItem("mis_canvas_complex_panel_opacity");
    if (savedComplexPanelPos) {
      try { setComplexPanelPos(JSON.parse(savedComplexPanelPos)); } catch (e) {}
    }
    if (savedComplexPanelSize) {
      try { setComplexPanelSize(JSON.parse(savedComplexPanelSize)); } catch (e) {}
    }
    if (savedComplexPanelOpacity) {
      try { setComplexPanelOpacity(JSON.parse(savedComplexPanelOpacity)); } catch (e) {}
    }

    const savedOpenParamSections = localStorage.getItem("mis_canvas_open_param_sections");
    if (savedOpenParamSections) {
      try { setOpenParamSections(new Set(JSON.parse(savedOpenParamSections))); } catch (e) {}
    }

    setHistory([{ pages: initialPages, elements: initialElements }]);
    setHistoryIndex(0);
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("mis_canvas_elements_multipage", JSON.stringify(elements));
      localStorage.setItem("mis_canvas_pages_list", JSON.stringify(pages));
      localStorage.setItem("mis_canvas_panel_pos", JSON.stringify(panelPos));
      localStorage.setItem("mis_canvas_panel_size", JSON.stringify(panelSize));
      localStorage.setItem("mis_canvas_panel_opacity", JSON.stringify(panelOpacity));
      localStorage.setItem("mis_canvas_complex_panel_pos", JSON.stringify(complexPanelPos));
      localStorage.setItem("mis_canvas_complex_panel_size", JSON.stringify(complexPanelSize));
      localStorage.setItem("mis_canvas_complex_panel_opacity", JSON.stringify(complexPanelOpacity));
      localStorage.setItem("mis_canvas_open_param_sections", JSON.stringify(Array.from(openParamSections)));
    }
  }, [
    elements,
    pages,
    panelPos,
    panelSize,
    panelOpacity,
    complexPanelPos,
    complexPanelSize,
    complexPanelOpacity,
    openParamSections,
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

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevState = history[prevIndex];
      setPages(prevState.pages);
      setElements(prevState.elements);
      setHistoryIndex(prevIndex);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextState = history[nextIndex];
      setPages(nextState.pages);
      setElements(nextState.elements);
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
      
      setPages(remainingPages);
      setElements(remainingElements);
      saveToHistory(remainingPages, remainingElements);

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
    const exportData = { pages, elements };
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
          setPages(parsed.pages);
          setElements(parsed.elements);
          saveToHistory(parsed.pages, parsed.elements);
          setCurrentPageId(parsed.pages[0]?.id || "home");
          setSelectedIds([]);
        } else if (Array.isArray(parsed)) {
          setElements(parsed);
          saveToHistory(pages, parsed);
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
  // відділення, з обох лікарень (org_edrpou), той самий канон, що й у qwerty.
  const handleImportDepartments = async () => {
    try {
      const res = await fetch("/api/departments");
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
      const listElement: CanvasElement = {
        id: listId,
        pageId: currentPageId,
        isGlobal: false,
        isTriggerTarget: false,
        showOnHoverId: null,
        showOnClickId: null,
        type: "list",
        content: "Відділення (Supabase, схема lpz)",
        width: 640,
        height: 420,
        x: 1,
        y: 1,
        textColor: "#ffffff",
        padding: 8,
        borderRadius: 0,
        fontSize: 12,
        fontFamily: "inherit",
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
        fontFamily: "inherit",
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
    handleSelectElement(el.id, e.shiftKey || e.ctrlKey);

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
    }
  };

  const handleAddElement = (e: React.FormEvent) => {
    e.preventDefault();
    const isButton = newType === "button";
    const isClock = newType === "clock";
    const width = isButton ? 120 : isClock ? 220 : forcedParentId ? 120 : 240;
    const height = isButton ? 40 : isClock ? 70 : forcedParentId ? 60 : 140;
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
      fontFamily: "inherit",
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
    fontFamily: "inherit",
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

    updateElementsAndHistory([...elements, newElement]);
    handleSelectElement(newElement.id);
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
    const remaining = elements.filter((el) => !idsToDelete.has(el.id));
    updateElementsAndHistory(remaining);
    setSelectedIds([]);
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

    const shouldHide = el.isTriggerTarget && (isTargetOfHover || isTargetOfClick) && !isHoverTriggered && !isClickTriggered && !isSelected;

    if (shouldHide) return null;

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
          if (!selectedIds.includes(el.id)) {
            handleSelectElement(el.id, false);
          }
        }}
        onDragStop={(e, d) => {
          e.stopPropagation();
          const siblings = elements.filter(
            (other) => other.id !== el.id && other.parentId === el.parentId && isVisibleOnPage(other, currentPageId)
          );
          const resolved = pushOutOfOverlap(d.x, d.y, currentWidth, currentHeight, siblings, 1);
          const nextElements = elements.map((item) => (item.id === el.id ? { ...item, x: resolved.x, y: resolved.y } : item));
          updateElementsAndHistory(nextElements);
        }}
        onResizeStop={(e, dir, ref, delta, pos) => {
          e.stopPropagation();
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
        enableResizing={true}
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
              boxShadow: el.isPressed ? activeShadow : "none",

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
          } ${
            isSelected
              ? "ring-4 ring-amber-400 ring-offset-1 shadow-lg"
              : "shadow-[0_0_6px_rgba(0,0,0,0.18)]"
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
            <div className="pointer-events-none whitespace-pre-wrap leading-normal overflow-hidden h-full w-full">
              {el.content}
            </div>
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
                  className="shrink-0 px-1 pb-1 font-semibold uppercase tracking-wide truncate pointer-events-none"
                  style={{ fontSize: `${el.fontSize || 12}px` }}
                >
                  {el.content}
                </div>
              )}
              {el.columns && el.columns.length > 0 && (
                <div className="shrink-0 flex items-center gap-2 px-1 pb-1 border-b border-black/15 pointer-events-none">
                  {el.columns.map((col) => (
                    <span
                      key={col.id}
                      className="truncate text-[10px] font-bold uppercase opacity-70"
                      style={{ flexGrow: col.width ?? 1, flexBasis: 0, minWidth: 0 }}
                    >
                      {col.label}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {children.length === 0 ? (
                  <div className="px-1 py-2 text-[11px] opacity-50 pointer-events-none">
                    Порожньо — виберіть цей список і додайте елемент
                  </div>
                ) : (
                  children.map((child) => (
                    <div
                      key={child.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectElement(child.id, e.shiftKey || e.ctrlKey);
                      }}
                      className={`flex items-center gap-2 px-1 py-1.5 border-b border-black/10 last:border-b-0 cursor-pointer ${
                        selectedIds.includes(child.id) ? "ring-2 ring-amber-400 ring-inset" : ""
                      }`}
                      style={{
                        color: child.textColor || "#000000",
                        backgroundColor: child.customBgColor || "transparent",
                        fontSize: `${child.fontSize || 12}px`,
                        fontFamily: child.fontFamily || "inherit",
                        fontWeight: child.fontWeight || "500",
                      }}
                    >
                      {el.columns && el.columns.length > 0 ? (
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
            />
          )}
        </div>
      </Rnd>
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
            onClick={(e) => handleSelectElement(el.id, e.shiftKey || e.ctrlKey)}
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
                  {el.isTriggerTarget ? "(👁️)" : ""}
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
              className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-3 py-1.5 rounded-md text-xs shadow-sm flex items-center gap-1.5 transition-colors"
              title="Створити елемент 'Список' з відділеннями з Supabase (схема lpz)"
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

        <div className="flex items-center gap-3 text-xs bg-slate-50 border px-3 py-1.5 rounded-lg">
          <span className="font-semibold text-slate-500">Рівні:</span>
          {LEVEL_COLORS.map((color, idx) => (
            <div key={color} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span>{idx + 1} рівень</span>
            </div>
          ))}
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <Rnd
          position={panelPos}
          size={panelSize}
          onDragStop={(e, d) => setPanelPos({ x: d.x, y: d.y })}
          onResizeStop={(e, dir, ref, delta, pos) => {
            setPanelSize({ width: parseInt(ref.style.width), height: parseInt(ref.style.height) });
            setPanelPos(pos);
          }}
          dragHandleClassName="panel-drag-handle"
          bounds="window"
          minWidth={260}
          minHeight={200}
          style={{ zIndex: 50 }}
        >
        <aside
          className="w-full h-full backdrop-blur-sm rounded-xl border border-slate-200 shadow-lg flex flex-col overflow-hidden"
          style={{ backgroundColor: `rgba(255, 255, 255, ${panelOpacity})` }}
        >
          <div className="panel-drag-handle cursor-move bg-slate-900/80 text-white text-[11px] font-bold px-3 py-2 rounded-t-xl flex items-center justify-between gap-2 shrink-0 select-none">
            <span>⠿ Панель управління</span>
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
          </div>
          <div className="flex items-center gap-1 px-3 pt-3 shrink-0">
            {(
              [
                { key: "create" as const, label: "🧱 Створити" },
                { key: "page" as const, label: "📄 Сторінка" },
                {
                  key: "params" as const,
                  label: `⚙️ Параметри${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`,
                },
              ]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActivePanelTab(tab.key)}
                className={`flex-1 text-[11px] font-bold py-1.5 rounded-md transition-colors ${
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
                        value={singleSelected ? singleSelected.width : ""}
                        onChange={(e) => updateSelectedFields("width", Number(e.target.value))}
                        className="w-full p-1.5 border rounded-md font-mono text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">Висота (H):</label>
                      <input
                        type="number"
                        min={1}
                        value={singleSelected ? singleSelected.height : ""}
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
                      value={singleSelected?.fontFamily || "inherit"}
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
                        value={singleSelected?.fontWeight || "500"}
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
                        value={singleSelected?.textAlign || "left"}
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
                      value={singleSelected ? singleSelected.fontSize ?? 12 : 12}
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
                        singleSelected?.customBgColor ||
                        (singleSelected ? getElementColor(singleSelected) : "#2563eb")
                      }
                      onChange={(e) => updateSelectedFields("customBgColor", e.target.value)}
                      className="w-full h-7 p-0 border rounded cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Текст:</label>
                    <input
                      type="color"
                      value={singleSelected ? singleSelected.textColor || "#ffffff" : "#ffffff"}
                      onChange={(e) => updateSelectedFields("textColor", e.target.value)}
                      className="w-full h-7 p-0 border rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Округлення кутів самого поля (блок/список) — раніше
                    borderRadius застосовувався лише до кнопок; тепер поле
                    теж може мати заокруглені кути незалежно від "рамки". */}
                {singleSelected && (singleSelected.type === "block" || singleSelected.type === "list") && (
                  <div>
                    <label className="flex items-center justify-between text-[10px] font-semibold text-slate-600 mb-1">
                      <span>Округлення кутів поля:</span>
                      <span className="font-mono text-slate-500">{singleSelected.borderRadius ?? 0}px</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={singleSelected.borderRadius ?? 0}
                      onChange={(e) => updateSelectedFields("borderRadius", Number(e.target.value))}
                      className="w-full cursor-pointer"
                    />
                  </div>
                )}

                {singleSelected && (singleSelected.type === "block" || singleSelected.type === "list") && (
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={singleSelected.meshBg ?? false}
                      onChange={(e) => updateSelectedFields("meshBg", e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    🌈 Анімований mesh-фон (замість кольору вище)
                  </label>
                )}
                {singleSelected && (singleSelected.type === "block" || singleSelected.type === "list") && singleSelected.meshBg && (
                  <div className="pl-1 space-y-2 border-t border-slate-200 pt-2">
                    <div>
                      <label className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                        <span>Швидкість:</span>
                        <span className="font-mono">{(singleSelected.meshSpeed ?? 1).toFixed(1)}×</span>
                      </label>
                      <input
                        type="range"
                        min={20}
                        max={300}
                        value={Math.round((singleSelected.meshSpeed ?? 1) * 100)}
                        onChange={(e) => updateSelectedFields("meshSpeed", Number(e.target.value) / 100)}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                        <span>Інтенсивність:</span>
                        <span className="font-mono">{Math.round(singleSelected.meshIntensity ?? 100)}%</span>
                      </label>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={singleSelected.meshIntensity ?? 100}
                        onChange={(e) => updateSelectedFields("meshIntensity", Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 mb-1">Кольори:</label>
                      <div className="flex gap-1">
                        {(singleSelected.meshColors ?? DEFAULT_MESH_COLORS).map((c, i) => (
                          <input
                            key={i}
                            type="color"
                            value={c}
                            onChange={(e) => {
                              const next = [...(singleSelected.meshColors ?? DEFAULT_MESH_COLORS)];
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

                {/* ДИНАМІЧНА РАМКА — перемикач + товщина на КОЖНОМУ елементі
                    окремо (не властивість батька), тому показуємо лише коли
                    в обраного елемента дійсно Є батько. Поки без розмиття —
                    проста суцільна рамка кольору поля. */}
                {singleSelected && singleSelected.parentId !== null && (
                  <div className="p-2.5 bg-slate-100/70 border border-slate-200 rounded-lg space-y-2">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={singleSelected.frame ?? false}
                        onChange={(e) => updateSelectedFields("frame", e.target.checked)}
                        className="rounded border-slate-300 text-slate-600 focus:ring-slate-500 h-4 w-4"
                      />
                      🖼️ Динамічна рамка кольору поля
                    </label>
                    {singleSelected.frame && (
                      <div>
                        <label className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                          <span>Товщина рамки:</span>
                          <span className="font-mono">{singleSelected.frameThickness ?? 10}px</span>
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={40}
                          value={singleSelected.frameThickness ?? 10}
                          onChange={(e) => updateSelectedFields("frameThickness", Number(e.target.value))}
                          className="w-full cursor-pointer"
                        />
                        <p className="text-[10px] text-slate-500 leading-snug mt-1.5">
                          Округлення кутів рамки повторює округлення самого поля (батька) — щоб змінити, виберіть поле і скористайтесь повзунком "Округлення кутів поля".
                        </p>
                      </div>
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
                      {Math.round((singleSelected?.bgOpacity ?? 1) * 100)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((singleSelected?.bgOpacity ?? 1) * 100)}
                    onChange={(e) => updateSelectedFields("bgOpacity", Number(e.target.value) / 100)}
                    className="w-full cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Padding (px):</label>
                  <input
                    type="number"
                    value={singleSelected ? singleSelected.padding ?? 0 : ""}
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
                          fontFamily: "inherit",
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
          </div>
        </aside>
        </Rnd>

        {/* Окрема плаваюча панель "Складні об'єкти" — список пресетів, при
            виборі відкриваються поля налаштувань (підсвітка/кольори/розміри
            тощо), перед тим як додати готовий елемент на полотно. */}
        <Rnd
          position={complexPanelPos}
          size={complexPanelSize}
          onDragStop={(e, d) => setComplexPanelPos({ x: d.x, y: d.y })}
          onResizeStop={(e, dir, ref, delta, pos) => {
            setComplexPanelSize({ width: parseInt(ref.style.width), height: parseInt(ref.style.height) });
            setComplexPanelPos(pos);
          }}
          dragHandleClassName="complex-panel-drag-handle"
          bounds="window"
          minWidth={240}
          minHeight={200}
          style={{ zIndex: 45 }}
        >
        <aside
          className="w-full h-full backdrop-blur-sm rounded-xl border border-slate-200 shadow-lg flex flex-col overflow-hidden"
          style={{ backgroundColor: `rgba(255, 255, 255, ${complexPanelOpacity})` }}
        >
          <div className="complex-panel-drag-handle cursor-move bg-teal-900/80 text-white text-[11px] font-bold px-3 py-2 rounded-t-xl flex items-center justify-between gap-2 shrink-0 select-none">
            <span>🧩 Складні об'єкти</span>
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
                value={Math.round(complexPanelOpacity * 100)}
                onChange={(e) => setComplexPanelOpacity(Number(e.target.value) / 100)}
                className="w-16 cursor-pointer"
              />
            </div>
          </div>
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
            </div>

            {selectedComplexObjectId &&
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
        </aside>
        </Rnd>

        {/* Полотно на всю сторінку */}
        <main
          onClick={() => {
            handleSelectElement(null);
            setClickedElementId(null);
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
          </div>
        </main>
      </div>
    </div>
  );
}
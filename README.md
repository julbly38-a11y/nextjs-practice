# Конструктор сторінок (nextjs-practice)

Візуальний drag-and-drop конструктор веб-сторінок на Next.js + React + Tailwind CSS. Дозволяє збирати кілька сторінок сайту з блоків, заголовків, тексту, кнопок і списків прямо в браузері, налаштовувати кожен елемент через плаваючу панель і експортувати результат у JSON або готовий HTML.

Увесь застосунок — це один клієнтський компонент [`AppBoundedCanvas`](app/page.tsx), що рендериться на `/` через [`app/page.tsx`](app/page.tsx).

## Демо

Проєкт задеплоєний на Vercel (проєкт `nextjs-practice`).

## Стек

- **Next.js 16** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- **[react-rnd](https://github.com/bokuweb/react-rnd)** — перетягування (drag) і зміна розміру (resize) елементів на полотні та самої панелі управління

## Можливості

### Полотно та елементи
- 5 типів елементів: **Блок**, **Заголовок**, **Текст**, **Кнопка**, **Список**
- Полотно займає весь екран (`<main>` на всю сторінку, без масштабування — координати елементів це реальні пікселі 1:1)
- Вільне перетягування та зміна розміру (`react-rnd`), прив'язка до сітки **1px** (можна вимкнути); візуальні крапки сітки — крок 5px, лише орієнтир
- **Дублювання елементів** — кнопка "Дублювати" в Параметрах або `Ctrl+D`: клонує елемент разом з усіма дочірніми, з новими унікальними id, зі зсувом +20/+20px
- **Створення кількох елементів одразу** — поле "Кількість" у формі створення (1–50): елементи одразу шикуються в горизонтальний ряд з відступом 8px; повторне створення продовжує ряд від останнього сусіда, а не починає заново з кутка
- **Перетягування й зміна розміру — вільні**, без блокування руху; при **відпусканні миші** кінцева позиція перевіряється і, якщо перекривається з сусідом (того ж рівня/батька) ближче ніж на 1px, елемент м'яко підштовхується назовні до мінімального відступу (`pushOutOfOverlap`) — сам рух ніхто не блокує, гарантується лише результат
- Новий дочірній елемент за замовчуванням отримує відступ 1px від краю свого батьківського блоку
- Вкладена ієрархія: елементи можна робити дочірніми до блоків і списків; дочірній елемент не може стати батьком свого ж предка (захист від циклів)
- Батьківський блок не можна зменшити менше, ніж займають його дочірні елементи (`getMinDimensions`)
- Кольори рівнів вкладеності (5 кольорів по колу) + можливість задати власний колір фону/тексту для кожного елемента
- Множинне виділення (Shift/Ctrl + клік) і масове редагування спільних полів (колір, прозорість фону тощо застосовуються одразу до всіх виділених)
- **Розмиті краї елементів** — замість чіткої лінії кожен елемент має м'яку розсіяну тінь по зовнішньому периметру; батьківські елементи, що мають дочірні (список, блок з вкладеними), додатково отримують м'яке розмиття по **внутрішньому** периметру (inset), щоб вкладені елементи візуально "занурювались" у контейнер

### Список (`type: "list"`)
- Контейнер, де дочірні елементи автоматично шикуються **вертикально** (без вільного позиціонування), з розділювачами між пунктами і нативним скролом, коли вміст не влазить
- Заголовок списку — це `content` самого елемента
- **Стовпці (опційно)** — можна додати довільну кількість стовпців (назва + відносна ширина); якщо стовпці задані, кожен рядок ділиться на комірки (`columnValues`), і зверху з'являється шапка з назвами стовпців — покриває і простий список (0 стовпців, один текстовий рядок на пункт), і табличний вигляд (кілька стовпців: ім'я, метадані, дні тощо)
- Пункти списку редагуються прямо в Параметрах панелі (без переходу на полотно): додавання/видалення рядків, редагування стовпців

### Каскадна глобальність (сторінки)
- Елемент можна зробити **глобальним** (`isGlobal`) — показується на всіх сторінках
- Додатково, на глобальному елементі можна увімкнути **"🌍➡️ Каскадом на всіх вкладених"** (`cascadeGlobal`, вимкнено за замовчуванням) — тоді ВСІ його нащадки теж вважаються видимими на всіх сторінках, незалежно від власного `isGlobal`/`pageId`
- Без каскаду (стара, і досі робоча поведінка) — глобальний контейнер може показувати РІЗНИЙ вміст залежно від активної сторінки (кожна дитина сама вирішує через власний `pageId`/`isGlobal`) — корисно для, напр., нижньої панелі, де одні кнопки скрізь, а інші лише на конкретній сторінці

### Плаваюча панель управління
- Ліва панель винесена з полотна в окреме плаваюче вікно (`react-rnd`) — можна перетягувати за хендл "⠿ Панель управління" і змінювати розмір, щоб не заважала полотну
- Повзунок прозорості панелі (👁️ в хедері панелі) — фон панелі напівпрозорий, змінюється в реальному часі
- Позиція, розмір і прозорість панелі зберігаються в `localStorage`
- Ієрархія елементів у панелі — **згортаються/розгортаються** (▶/▼) гілки з дочірніми елементами

### Сторінки
- Кілька сторінок сайту (перемикач у хедері), кожна із власною назвою
- Кнопка може вести на іншу сторінку (`targetPageId`) — клік перемикає активну сторінку
- При завантаженні збереженого проєкту активна сторінка автоматично переключається на першу реальну сторінку зі списку (виправлено баг: раніше активна сторінка за замовчуванням лишалась `"home"`, якої немає серед збережених сторінок, — після оновлення сторінки показувались лише глобальні елементи, поки вручну не клацнути на вкладку)

### Тригери появи (Hover / Click)
- Будь-який елемент можна позначити як **"схований за замовчуванням"** (`isTriggerTarget`)
- Інші елементи можуть відкривати його при наведенні (`showOnHoverId`) або кліку (`showOnClickId`) — основа для випадаючих меню, підказок, акордеонів

### Кнопки: розширені стани
- Окремий текст/фон/колір тексту для **Hover** та **Active/Pressed** станів
- Світіння (glow) при наведенні — колір і розмиття
- Режим **Toggle** — кнопка перемикається між ON/OFF і зберігає стан (`isPressed`)
- Зміна ширини/висоти та зсув по Y у натиснутому стані

### Типографіка та фон
- Шрифт (кілька пресетів + системний), насиченість (300–900), вирівнювання тексту, розмір шрифту, padding, border-radius (для кнопок)
- **Прозорість фону** (`bgOpacity`, 0–100%) — окремий повзунок у Параметрах, застосовується масово до всіх виділених елементів; враховується і в живому редакторі, і в експорті HTML (колір фону конвертується в `rgba()`)

### Історія та збереження
- **Undo/Redo** до 30 кроків, гарячі клавіші `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`
- Автозбереження стану в `localStorage`:
  - `mis_canvas_elements_multipage` — сторінки та елементи
  - `mis_canvas_pages_list` — список сторінок
  - `mis_canvas_panel_pos`, `mis_canvas_panel_size`, `mis_canvas_panel_opacity` — позиція/розмір/прозорість плаваючої панелі

### Імпорт / Експорт
- **💾 Зберегти JSON** — вивантажує весь проєкт (`{ pages, elements }`)
- **📂 Завантажити JSON** — імпортує раніше збережений проєкт (підтримує і старий формат — просто масив елементів)
- **🌐 Експорт в HTML** — генерує самодостатній статичний HTML-файл з інлайн-стилями (враховуючи `bgOpacity`, списки й стовпці) та JS-функцією перемикання сторінок (без React і Tailwind)

## Модель даних

```ts
interface Page {
  id: string;
  name: string;
}

interface ListColumn {
  id: string;
  label: string;
  width?: number; // відносна вага (flex-grow), за замовчуванням 1
}

interface CanvasElement {
  id: number;
  pageId: string;
  isGlobal?: boolean;
  cascadeGlobal?: boolean; // якщо true (і isGlobal true) — усі вкладені елементи теж глобальні
  type: "block" | "heading" | "text" | "button" | "list";
  content: string;
  width: number; height: number; x: number; y: number;
  textColor: string; padding: number; borderRadius: number; fontSize: number;
  parentId: number | null;
  customBgColor?: string;
  bgOpacity?: number; // 0..1, прозорість фону елемента

  // "Список" (type: "list")
  columns?: ListColumn[];        // конфігурація стовпців (на самому list-елементі)
  columnValues?: Record<string, string>; // значення по стовпцях (на дочірньому рядку)

  // тригери появи
  showOnHoverId?: number | null;
  showOnClickId?: number | null;
  isTriggerTarget?: boolean;

  // типографіка
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right" | "justify";

  // навігація
  targetPageId?: string | null;

  // hover-стан кнопки
  hoverContent?: string; hoverBgColor?: string; hoverTextColor?: string;
  glowColor?: string; glowBlur?: number;

  // active/toggle-стан кнопки
  activeContent?: string; activeBgColor?: string; activeTextColor?: string;
  activeScale?: number; activeOffsetY?: number;
  activeGlowColor?: string; activeGlowBlur?: number;
  activeWidthOffset?: number; activeHeightOffset?: number;
  isToggle?: boolean; isPressed?: boolean;
}
```

## Структура проєкту

```
app/
  layout.tsx    # кореневий layout, шрифти Geist
  page.tsx      # весь конструктор (AppBoundedCanvas)
  globals.css   # Tailwind + CSS-змінні теми
public/         # статичні SVG-іконки (стандартні для create-next-app)
```

## Запуск

```bash
npm install
npm run dev
```

Відкрити [http://localhost:3000](http://localhost:3000).

Інші команди:

```bash
npm run build   # production-збірка
npm run start   # запуск production-збірки
npm run lint    # ESLint
```

## Довідник показників ЛСМД (для прив'язки даних до карток)

Перенесено з `docs/FORMULAS.md` старого проєкту (`hospital-analytics`) — **80+ обчислюваних полів**, витягнутих з VIEW/Materialized Views Supabase БД (`wnyfrckxhwujsjcfxqou`, джерело — Looker Studio → нативний SQL). Використовується як довідник, коли карткам конструктора (напр. «Картка КПІ») потрібно прив'язати реальні дані замість тестових.

### 1. Базові прапорці (`v_case_metrics`)

| Показник | Формула |
|---|---|
| `f_death` | `(discharge_status = 'Помер')::integer` |
| `f_improved` | `(discharge_status = 'З поліпшенням')::integer` |
| `f_nochange` | `(discharge_status = 'Без змін')::integer` |
| `f_worse` | `(discharge_status = 'З погіршенням')::integer` |
| `f_transferred` | `(discharge_status LIKE '%Переведений%')::integer` |
| `f_urgent` | `(admission_type = 'Екстренна')::integer` |
| `f_planned` | `(admission_type = 'Планова')::integer` |
| `f_referral` | `(referral IS NOT NULL AND referral <> '')::integer` |
| `f_operation` | `(operation_id IS NOT NULL)::integer` |
| `f_urgent_operation` | `(admission_type = 'Екстренна' AND operation_id IS NOT NULL)::integer` |
| `f_female` / `f_male` | `(gender = 'Ж')::integer` / `(gender = 'Ч')::integer` |
| `patient_age` | `EXTRACT(year FROM age(admission_date_d, birth_date_d))::integer` |
| `f_child` / `f_elderly` | `(patient_age < 18)::integer` / `(patient_age >= 60)::integer` |
| `age_group` | `CASE WHEN patient_age<18 THEN '0-17' WHEN <=39 THEN '18-39' WHEN <=59 THEN '40-59' WHEN <=74 THEN '60-74' ELSE '75+' END` |
| `f_night` | `(shift_time = 'нічне')::integer` |
| `shift_time` | `CASE WHEN admission_time::time >= '22:00' OR < '07:00' THEN 'нічне' ELSE 'денне' END` |
| `day_type` | `CASE WHEN EXTRACT(DOW FROM admission_date_d) IN (0,6) THEN 'вихідний' ELSE 'будній' END` |
| `f_urgent_death` | `(admission_type='Екстренна' AND discharge_status='Помер')::integer` |
| `f_planned_death` | `(admission_type='Планова' AND discharge_status='Помер')::integer` |
| `f_urgent_transfer` | `(admission_type='Екстренна' AND discharge_status LIKE '%Переведений%')::integer` |
| `bed_days` | `length_of_stay` |
| `length_of_stay` | `(discharge_date_d - admission_date_d)::int` |

### 2. Госпітальні показники (`v_hospital_summary`)

| Показник | Формула |
|---|---|
| `total_cases` | `COUNT(*)` |
| `unique_patients` | `COUNT(DISTINCT patient_id)` |
| `total_bed_days` | `SUM(bed_days)` |
| `avg_bed_days` | `ROUND(AVG(bed_days), 1)` |
| `avg_age` | `ROUND(AVG(patient_age), 1)` |
| `death_rate_pct` | `ROUND(100.0 * SUM(f_death) / COUNT(*), 2)` |
| `urgent_pct` | `ROUND(100.0 * SUM(f_urgent) / COUNT(*), 2)` |
| `surgical_activity_pct` | `ROUND(100.0 * SUM(f_operation) / COUNT(*), 2)` |
| `percentage` (загальна формула) | `ROUND(100.0 * числитель::numeric / знаменник::numeric, 2)` |
| `deaths` / `operations` / `transferred` / `worse` / `urgent` / `planned` | `SUM(f_death)` / `SUM(f_operation)` / `SUM(f_transferred)` / `SUM(f_worse)` / `SUM(f_urgent)` / `SUM(f_planned)` |

### 3. Показники відділень (`v_department_stats`, group by `discharge_department`)

`total_cases`, `unique_patients`, `avg_bed_days`, `max_bed_days`, `deaths`, `death_rate_pct`, `urgent`, `urgent_pct`, `operations`, `surgical_activity_pct`, `avg_age`, `women`, `men`, `children`, `elderly`, `with_referral`, `improved`, `nochange` — ті самі формули з розділу 1-2, згруповані по `discharge_department`.

### 4. Повторні госпіталізації (`v_readmissions` / `v_readmission_metrics`)

| Показник | Формула |
|---|---|
| `next_admission` | `LEAD(admission_date_d) OVER (PARTITION BY patient_id ORDER BY admission_date_d)` |
| `next_icd` | `LEAD(icd_primary) OVER (PARTITION BY patient_id ORDER BY admission_date_d)` |
| `days_to_readmission` | `next_admission - discharge_date_d` |
| `readmit_30d` | `(days_to_readmission BETWEEN 0 AND 30)::integer` |
| `readmit_90d` | `(days_to_readmission BETWEEN 0 AND 90)::integer` |
| `same_diagnosis` | `(next_icd = icd_primary)::integer` |
| `total_with_followup` | `COUNT(*)` (з `v_readmissions`) |
| `readmit_30d_pct` / `readmit_90d_pct` | `ROUND(100.0 * SUM(readmit_30d)/COUNT(*), 2)` / аналогічно для 90d |
| `same_dx_30d` | `SUM(CASE WHEN readmit_30d=1 AND same_diagnosis=1 THEN 1 ELSE 0 END)` |

### 5. Ургентні показники (`v_urgency_stats`, group by `hosp_type`)

`total_cases`, `deaths`, `death_rate_pct`, `operations`, `surgery_pct`, `avg_bed_days`, `transferred`, `worse`.

### 6. Діагнози (`v_diagnosis_stats`, group by `icd_primary`)

`cases`, `patients`, `deaths`, `death_rate_pct`, `operations`, `surgery_pct`, `avg_bed_days`, `avg_age`, `women`, `men`.

### 7. Пікові навантаження

| View | Group by | Показники |
|---|---|---|
| `v_peak_by_hour` | `EXTRACT(hour FROM admission_ts)` | `admissions`, `urgent`, `planned` |
| `v_peak_by_weekday` | `EXTRACT(DOW FROM admission_date_d)` (0=нд, 6=сб) | `admissions`, `urgent`, `night_admissions` |
| `v_peak_by_month` | `EXTRACT(month FROM admission_date_d)` | `admissions`, `deaths`, `operations` |

### 8. Географія (`v_region_stats`, group by `region`)

`patients`, `unique_patients`, `cities` (`array_agg(DISTINCT city_name)`), `women`, `men`, `avg_age`.

### 9. Пацієнти (`v_patient_stats`, group by `gender, age_group`)

`cases`, `unique_patients`, `deaths`, `death_rate_pct`, `avg_bed_days`, `operations`.

### 10. Загальні правила розрахунку

```sql
percentage    = ROUND(100.0 * числитель::numeric / знаменник::numeric, 2)
average       = ROUND(AVG(column), 1)
flag          = (умова)::integer
unique_count  = COUNT(DISTINCT column)
sum_of_flags  = SUM(flag)

-- Window functions
LEAD(column) OVER (PARTITION BY patient_id ORDER BY date)   -- наступний запис
LAG(column)  OVER (PARTITION BY patient_id ORDER BY date)   -- попередній запис
ROW_NUMBER() OVER (PARTITION BY group ORDER BY metric DESC)
SUM(column)  OVER (PARTITION BY group ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
```

### 11. Materialized Views (кешовані, оновлюються щоночі о 02:00 через `pg_cron`)

| View | Зміст |
|---|---|
| `mv_daily_stats` | `v_case_metrics GROUP BY admission_date_d` (~2265 рядків) |
| `mv_dept_stats` | `v_department_stats` (20 рядків) |
| `mv_doctor_full` | лікар + його статистика (868 рядків) |
| `mv_icd_usage` | `icd_10` + `COUNT(випадків)` (19824 рядки) |

Ручне оновлення: `SELECT refresh_all_mviews();`

### 13. Важливі фільтри для точності

- **Плейсхолдер "Лікується"** — `discharge_date = admission + 10 днів`, не реальна виписка. Виключати: `WHERE discharge_status <> 'Лікується'`.
- **Коректні повторні госпіталізації** — `WHERE days_to_readmission >= 0 AND days_to_readmission <= 365`.
- **Реальне середнє ліжко-день** — рахувати без `'Лікується'`: `WHERE discharge_status <> 'Лікується'`.

> Повний оригінал з прикладами використання (топ відділень за летальністю, випадки за місяць тощо) — `docs/FORMULAS.md` у репозиторії `hospital-analytics`.

## Відомі обмеження / напрямки розвитку

- Стан живе лише в `localStorage` браузера — немає бекенду чи мультикористувацького збереження
- Немає видалення окремої сторінки з підтвердженням через UI-модалку (лише `window.confirm`)
- Експорт в HTML не переносить hover/active-стани кнопок та тригери появи (тільки базовий вигляд, перехід між сторінками, прозорість фону, списки/стовпці)
- `updateSelectedFields` типізований через `any` для значення поля — можна звузити типи
- Резервне обмеження при resize (`resolveResizeCollision`) досі перевіряє весь шлях зміни розміру, а не лише кінцевий результат, — на відміну від drag, де лишилась тільки перевірка кінцевої позиції

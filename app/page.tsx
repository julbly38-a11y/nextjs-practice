"use client";

import { useState, useEffect, useRef } from "react";
import { Rnd } from "react-rnd";

type ElementType = "block" | "heading" | "text" | "button";

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
};

interface CanvasElement {
  id: number;
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

  // Hover параметри
  hoverContent?: string;      
  hoverBgColor?: string;
  hoverTextColor?: string;
  glowColor?: string;
  glowBlur?: number;

  // Active / Pressed параметри
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
}

export default function AppBoundedCanvas() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  const [newType, setNewType] = useState<ElementType>("block");
  const [newContent, setNewContent] = useState<string>("Елемент");
  const [forcedParentId, setForcedParentId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem("mis_canvas_elements_bounded");
    if (saved) {
      try {
        setElements(JSON.parse(saved));
      } catch (e) {
        console.error("Помилка зчитування з localStorage:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("mis_canvas_elements_bounded", JSON.stringify(elements));
    }
  }, [elements, isMounted]);

  const getMinDimensions = (parentId: number) => {
    const children = elements.filter((el) => el.parentId === parentId);
    if (children.length === 0) {
      return { minWidth: 20, minHeight: 20 };
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
      minWidth: Math.max(20, maxRight),
      minHeight: Math.max(20, maxBottom),
    };
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(elements, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `canvas-layout-${Date.now()}.json`);
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
        if (Array.isArray(parsed)) {
          setElements(parsed);
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

  const selectedElements = elements.filter((el) => selectedIds.includes(el.id));
  const singleSelected = selectedElements.length === 1 ? selectedElements[0] : null;

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
      if (el && el.type === "block") {
        setForcedParentId(id);
      }
    }
  };

  const handleButtonClick = (e: React.MouseEvent, el: CanvasElement) => {
    e.stopPropagation();
    handleSelectElement(el.id, e.shiftKey || e.ctrlKey);

    if (el.type === "button" && el.isToggle) {
      setElements((prev) =>
        prev.map((item) =>
          item.id === el.id ? { ...item, isPressed: !item.isPressed } : item
        )
      );
    }
  };

  const handleAddElement = (e: React.FormEvent) => {
    e.preventDefault();
    const isButton = newType === "button";
    const newElement: CanvasElement = {
      id: Date.now(),
      type: newType,
      content: newContent,
      width: isButton ? 120 : forcedParentId ? 120 : 240,
      height: isButton ? 40 : forcedParentId ? 60 : 140,
      x: 5,
      y: 5,
      textColor: "#ffffff",
      padding: isButton ? 4 : 8,
      borderRadius: isButton ? 8 : 0,
      fontSize: newType === "heading" ? 16 : 12,
      parentId: forcedParentId,
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
    };
    setElements((prev) => [...prev, newElement]);
    handleSelectElement(newElement.id);
  };

  const updateSelectedFields = (field: keyof CanvasElement, value: any) => {
    if (selectedIds.length === 0) return;
    setElements((prev) =>
      prev.map((el) => {
        if (!selectedIds.includes(el.id)) return el;

        let newValue = value;
        if (field === "width" || field === "height") {
          const { minWidth, minHeight } = getMinDimensions(el.id);
          if (field === "width") newValue = Math.max(Number(value), minWidth);
          if (field === "height") newValue = Math.max(Number(value), minHeight);
        }

        return { ...el, [field]: newValue };
      })
    );
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
    setElements((prev) => prev.filter((el) => !idsToDelete.has(el.id)));
    setSelectedIds([]);
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
    setElements((prev) =>
      prev.map((el) =>
        el.id === elementId ? { ...el, parentId: newParent, x: 5, y: 5 } : el
      )
    );
  };

  const renderCanvasNode = (el: CanvasElement) => {
    const children = elements.filter((child) => child.parentId === el.id);
    const isSelected = selectedIds.includes(el.id);
    const computedBgColor = getElementColor(el);
    const isButton = el.type === "button";

    const { minWidth, minHeight } = getMinDimensions(el.id);

    const glowBlur = el.glowBlur || 0;
    const glowColor = el.glowColor || "#3b82f6";
    const hoverShadow = glowBlur > 0 ? `0 0 ${glowBlur}px ${glowColor}` : "none";

    const activeGlowBlur = el.activeGlowBlur || 0;
    const activeGlowColor = el.activeGlowColor || glowColor;
    const activeShadow = activeGlowBlur > 0 ? `0 0 ${activeGlowBlur}px ${activeGlowColor}` : hoverShadow;

    const currentWidth = el.isPressed ? el.width + (el.activeWidthOffset || 0) : el.width;
    const currentHeight = el.isPressed ? el.height + (el.activeHeightOffset || 0) : el.height;

    return (
      <Rnd
        key={el.id}
        size={{ width: currentWidth, height: currentHeight }}
        position={{ x: el.x, y: el.y }}
        bounds="parent"
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
          setElements((prev) =>
            prev.map((item) => (item.id === el.id ? { ...item, x: d.x, y: d.y } : item))
          );
        }}
        onResizeStop={(e, dir, ref, delta, pos) => {
          e.stopPropagation();
          setElements((prev) =>
            prev.map((item) =>
              item.id === el.id
                ? {
                    ...item,
                    width: parseInt(ref.style.width),
                    height: parseInt(ref.style.height),
                    x: pos.x,
                    y: pos.y,
                  }
                : item
            )
          );
        }}
        enableResizing={true}
        style={{ zIndex: isSelected ? 40 : 10 }}
      >
        <div
          onClick={(e) => handleButtonClick(e, el)}
          style={
            {
              backgroundColor: el.isPressed
                ? (el.activeBgColor || el.hoverBgColor || computedBgColor)
                : computedBgColor,
              color: el.isPressed
                ? (el.activeTextColor || el.hoverTextColor || el.textColor || "#ffffff")
                : (el.textColor || "#ffffff"),
              width: "100%",
              height: "100%",
              borderRadius: isButton ? `${el.borderRadius ?? 8}px` : "0px",
              padding: `${el.padding || 0}px`,
              fontSize: `${el.fontSize || 12}px`,
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
          className={`interactive-node font-medium relative box-border transition-all duration-75 cursor-pointer select-none ${
            isButton ? "is-button-element flex items-center justify-center" : ""
          } ${
            isSelected
              ? "ring-4 ring-amber-400 ring-offset-1 shadow-lg"
              : "border border-black/15 shadow-sm"
          }`}
        >
          {el.type === "button" && (
            <div className="font-bold truncate pointer-events-none opacity-90 text-center px-1">
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
            <div className="font-bold leading-tight pointer-events-none truncate">
              {el.content}
            </div>
          )}
          {el.type === "text" && (
            <div className="pointer-events-none whitespace-pre-wrap leading-normal overflow-hidden h-full">
              {el.content}
            </div>
          )}

          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="relative w-full h-full pointer-events-auto">
              {children.map((child) => renderCanvasNode(child))}
            </div>
          </div>
        </div>
      </Rnd>
    );
  };

  const renderSidebarTree = (parentId: number | null, depth = 0) => {
    const children = elements.filter((el) => el.parentId === parentId);
    if (children.length === 0) return null;

    return children.map((el) => {
      const isSelected = selectedIds.includes(el.id);
      const possibleParents = elements.filter(
        (p) => p.type === "block" && isValidParent(el.id, p.id)
      );
      const currentColor = getElementColor(el);

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
              <span
                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                style={{ backgroundColor: currentColor }}
              />
              <span className="truncate">
                <span className="text-[10px] opacity-60 mr-1 font-semibold">
                  [{TYPE_LABELS[el.type]}]
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
          {renderSidebarTree(el.id, depth + 1)}
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
          <h1 className="text-xl font-bold text-slate-900">Полотно елементів</h1>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJSON}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-md text-xs shadow-sm flex items-center gap-1.5 transition-colors"
            >
              💾 Зберегти JSON
            </button>

            <button
              onClick={triggerFileInput}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-3 py-1.5 rounded-md text-xs shadow-sm flex items-center gap-1.5 transition-colors"
            >
              📂 Завантажити JSON
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

      <div className="flex flex-1 p-6 gap-6">
        <aside className="w-80 bg-white p-5 rounded-xl border border-slate-200 shadow-sm shrink-0 flex flex-col gap-6 overflow-y-auto max-h-[85vh]">
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
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 rounded-md text-xs shadow-sm"
            >
              + Створити елемент
            </button>
          </form>

          {/* Ієрархія елементів */}
          <div className="space-y-2 pb-4 border-b">
            <h2 className="font-bold text-xs uppercase text-slate-500">
              Ієрархія елементів:
            </h2>
            <div className="space-y-1 text-xs">{renderSidebarTree(null)}</div>
          </div>

          {/* ПАРАМЕТРИ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-sm">
                Параметри {selectedIds.length > 1 && `(${selectedIds.length})`}
              </h2>
              {selectedElements.length > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded text-[11px] hover:bg-red-100 font-medium"
                >
                  Видалити
                </button>
              )}
            </div>

            {selectedElements.length > 0 ? (
              <div className="space-y-4 text-xs">
                {singleSelected && (
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
                )}

                {/* ЖИВІ ЦИФРИ: Позиція та розміри */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                  <span className="font-bold text-[11px] text-slate-700 uppercase block">
                    📏 Позиція та розміри (Live):
                  </span>

                  {/* Координати X та Y (Живі дані) */}
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

                  {/* Ширина та Висота (Редаговані + Живі) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">Ширина (W):</label>
                      <input
                        type="number"
                        value={singleSelected ? singleSelected.width : ""}
                        onChange={(e) => updateSelectedFields("width", Number(e.target.value))}
                        className="w-full p-1.5 border rounded-md font-mono text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">Висота (H):</label>
                      <input
                        type="number"
                        value={singleSelected ? singleSelected.height : ""}
                        onChange={(e) => updateSelectedFields("height", Number(e.target.value))}
                        className="w-full p-1.5 border rounded-md font-mono text-xs bg-white"
                      />
                    </div>
                  </div>
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

                {/* НАЛАШТУВАННЯ ДЛЯ КНОПОК */}
                {singleSelected?.type === "button" ? (
                  <>
                    <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-indigo-900 flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={singleSelected.isToggle ?? false}
                            onChange={(e) => updateSelectedFields("isToggle", e.target.checked)}
                            className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                          />
                          Режим перемикача (Toggle)
                        </label>
                      </div>
                      {singleSelected.isToggle && (
                        <div className="flex items-center justify-between pt-1 border-t border-indigo-100">
                          <span className="text-[10px] text-indigo-700 font-medium">Затиснутий стан:</span>
                          <button
                            type="button"
                            onClick={() => updateSelectedFields("isPressed", !singleSelected.isPressed)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              singleSelected.isPressed
                                ? "bg-indigo-600 text-white"
                                : "bg-indigo-200 text-indigo-800"
                            }`}
                          >
                            {singleSelected.isPressed ? "ON (Pressed)" : "OFF (Normal)"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="p-2.5 bg-blue-50/60 border border-blue-200 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-bold text-blue-900">
                          🔘 Округлення кутів (Radius px):
                        </label>
                        <span className="text-[10px] text-blue-600 font-mono font-semibold">
                          {singleSelected.borderRadius ?? 8}px
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="30"
                          value={singleSelected.borderRadius ?? 8}
                          onChange={(e) => updateSelectedFields("borderRadius", Number(e.target.value))}
                          className="w-full h-1.5 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-50 border rounded-lg space-y-2">
                      <span className="font-bold text-[11px] text-slate-700 uppercase block">
                        ✨ При наведенні (Hover):
                      </span>

                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Надпис при Hover:</label>
                        <input
                          type="text"
                          placeholder={singleSelected.content}
                          value={singleSelected?.hoverContent || ""}
                          onChange={(e) => updateSelectedFields("hoverContent", e.target.value)}
                          className="w-full p-1 border rounded text-xs bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Фон Hover:</label>
                          <input
                            type="color"
                            value={singleSelected?.hoverBgColor || singleSelected?.customBgColor || "#1d4ed8"}
                            onChange={(e) => updateSelectedFields("hoverBgColor", e.target.value)}
                            className="w-full h-6 p-0 border rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Текст Hover:</label>
                          <input
                            type="color"
                            value={singleSelected?.hoverTextColor || singleSelected?.textColor || "#ffffff"}
                            onChange={(e) => updateSelectedFields("hoverTextColor", e.target.value)}
                            className="w-full h-6 p-0 border rounded cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Свічення Hover:</label>
                          <input
                            type="color"
                            value={singleSelected?.glowColor || "#3b82f6"}
                            onChange={(e) => updateSelectedFields("glowColor", e.target.value)}
                            className="w-full h-6 p-0 border rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Сила (Blur px):</label>
                          <input
                            type="number"
                            value={singleSelected?.glowBlur ?? 8}
                            onChange={(e) => updateSelectedFields("glowBlur", Number(e.target.value))}
                            className="w-full p-1 border rounded text-xs bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-50 border rounded-lg space-y-2">
                      <span className="font-bold text-[11px] text-slate-700 uppercase block">
                        🖱️ При натисканні (Active / Click):
                      </span>

                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1">Надпис при Active:</label>
                        <input
                          type="text"
                          placeholder={singleSelected.hoverContent || singleSelected.content}
                          value={singleSelected?.activeContent || ""}
                          onChange={(e) => updateSelectedFields("activeContent", e.target.value)}
                          className="w-full p-1 border rounded text-xs bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Фон Active:</label>
                          <input
                            type="color"
                            value={singleSelected?.activeBgColor || "#1e40af"}
                            onChange={(e) => updateSelectedFields("activeBgColor", e.target.value)}
                            className="w-full h-6 p-0 border rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Текст Active:</label>
                          <input
                            type="color"
                            value={singleSelected?.activeTextColor || singleSelected?.textColor || "#ffffff"}
                            onChange={(e) => updateSelectedFields("activeTextColor", e.target.value)}
                            className="w-full h-6 p-0 border rounded cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Δ Ширини (px):</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={singleSelected?.activeWidthOffset ?? 0}
                            onChange={(e) => updateSelectedFields("activeWidthOffset", Number(e.target.value))}
                            className="w-full p-1 border rounded text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Δ Висоти (px):</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={singleSelected?.activeHeightOffset ?? 0}
                            onChange={(e) => updateSelectedFields("activeHeightOffset", Number(e.target.value))}
                            className="w-full p-1 border rounded text-xs bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Масштаб (Scale):</label>
                          <input
                            type="number"
                            step="0.01"
                            value={singleSelected?.activeScale ?? 0.96}
                            onChange={(e) => updateSelectedFields("activeScale", Number(e.target.value))}
                            className="w-full p-1 border rounded text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Зсув Y (px):</label>
                          <input
                            type="number"
                            value={singleSelected?.activeOffsetY ?? 1}
                            onChange={(e) => updateSelectedFields("activeOffsetY", Number(e.target.value))}
                            className="w-full p-1 border rounded text-xs bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Свічення Active:</label>
                          <input
                            type="color"
                            value={singleSelected?.activeGlowColor || "#60a5fa"}
                            onChange={(e) => updateSelectedFields("activeGlowColor", e.target.value)}
                            className="w-full h-6 p-0 border rounded cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Сила (Blur px):</label>
                          <input
                            type="number"
                            value={singleSelected?.activeGlowBlur ?? 14}
                            onChange={(e) => updateSelectedFields("activeGlowBlur", Number(e.target.value))}
                            className="w-full p-1 border rounded text-xs bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                    ℹ️ Налаштування ефектів hover/active/glow доступні для елементів типу <b>"Кнопка"</b>.
                  </div>
                )}

                {/* Padding & Font-size */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Padding (px):</label>
                    <input
                      type="number"
                      value={singleSelected ? singleSelected.padding ?? 0 : ""}
                      onChange={(e) => updateSelectedFields("padding", Number(e.target.value))}
                      className="w-full p-1.5 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Font Size (px):</label>
                    <input
                      type="number"
                      value={singleSelected ? singleSelected.fontSize ?? 12 : ""}
                      onChange={(e) => updateSelectedFields("fontSize", Number(e.target.value))}
                      className="w-full p-1.5 border rounded-md"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center bg-slate-50 border border-dashed rounded-lg text-slate-400 text-xs">
                Виберіть елемент для налаштування
              </div>
            )}
          </div>
        </aside>

        {/* Полотно */}
        <main
          onClick={() => handleSelectElement(null)}
          className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm relative overflow-hidden min-h-[800px]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-60 pointer-events-none" />
          <div className="relative w-full h-full">
            {elements
              .filter((el) => el.parentId === null)
              .map((el) => renderCanvasNode(el))}
          </div>
        </main>
      </div>
    </div>
  );
}
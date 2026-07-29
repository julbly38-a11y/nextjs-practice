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
  pageId: string;
  isGlobal?: boolean;
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

  // Налаштування появи
  showOnHoverId?: number | null;
  showOnClickId?: number | null;
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
}

interface Page {
  id: string;
  name: string;
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

  const [hoveredElementId, setHoveredElementId] = useState<number | null>(null);
  const [clickedElementId, setClickedElementId] = useState<number | null>(null);

  const [newType, setNewType] = useState<ElementType>("block");
  const [newContent, setNewContent] = useState<string>("Елемент");
  const [forcedParentId, setForcedParentId] = useState<number | null>(null);

  // СТАНТИ: Сітка (Grid Snap) та Історія (Undo/Redo)
  const [enableGrid, setEnableGrid] = useState<boolean>(true);
  const [history, setHistory] = useState<{ pages: Page[]; elements: CanvasElement[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Позиція та розмір плаваючої панелі управління (винесена з полотна, щоб не заважала)
  const [panelPos, setPanelPos] = useState<{ x: number; y: number }>({ x: 24, y: 24 });
  const [panelSize, setPanelSize] = useState<{ width: number; height: number }>({ width: 340, height: 640 });
  const [panelOpacity, setPanelOpacity] = useState<number>(0.8);

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
    }
  }, [elements, pages, panelPos, panelSize, panelOpacity, isMounted]);

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

  const getMinDimensions = (parentId: number) => {
    const children = elements.filter((el) => el.parentId === parentId && (el.isGlobal || el.pageId === currentPageId));
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
        background-color: ${computedBgColor};
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
      if (el.type === "button") {
        contentHTML = `<button style="width:100%;height:100%;border:none;background:transparent;color:inherit;font:inherit;cursor:pointer;" ${
          el.targetPageId ? `onclick="switchPage('${el.targetPageId}')"` : ""
        }>${el.content}</button>`;
      } else if (el.type === "heading") {
        contentHTML = `<h2 style="margin:0;font-size:inherit;">${el.content}</h2>`;
      } else {
        contentHTML = `<div>${el.content}</div>`;
      }

      const innerChildrenHTML = children.map((c) => renderElementHTML(c)).join("");

      return `
        <div id="el-${el.id}" style="${style}">
          ${contentHTML}
          ${innerChildrenHTML}
        </div>
      `;
    };

    const pagesHTML = pages
      .map((p) => {
        const topElements = elements.filter(
          (el) => el.parentId === null && (el.isGlobal || el.pageId === p.id)
        );
        return `
        <div id="page-${p.id}" class="page-container" style="display: ${p.id === currentPageId ? "block" : "none"}; position: relative; width: 100%; min-height: 800px;">
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
        <style>
          body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; }
          .page-container { position: relative; max-width: 1200px; margin: 0 auto; background: #ffffff; min-height: 100vh; }
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

    if (el.showOnClickId) {
      setClickedElementId((prev) => (prev === el.showOnClickId ? null : (el.showOnClickId ?? null)));
    }

    if (el.type === "button") {
      if (el.targetPageId) {
        setCurrentPageId(el.targetPageId);
        setSelectedIds([]);
      }

      if (el.isToggle) {
        const nextElements = elements.map((item) =>
          item.id === el.id ? { ...item, isPressed: !item.isPressed } : item
        );
        updateElementsAndHistory(nextElements);
      }
    }
  };

  const handleAddElement = (e: React.FormEvent) => {
    e.preventDefault();
    const isButton = newType === "button";
    const newElement: CanvasElement = {
      id: Date.now(),
      pageId: currentPageId,
      isGlobal: false,
      isTriggerTarget: false,
      showOnHoverId: null,
      showOnClickId: null,
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
    };
    const nextElements = [...elements, newElement];
    updateElementsAndHistory(nextElements);
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
      el.id === elementId ? { ...el, parentId: newParent, x: 5, y: 5 } : el
    );
    updateElementsAndHistory(nextElements);
  };

  const renderCanvasNode = (el: CanvasElement) => {
    const children = elements.filter((child) => child.parentId === el.id && (child.isGlobal || child.pageId === currentPageId));
    const isSelected = selectedIds.includes(el.id);
    const computedBgColor = applyBgOpacity(getElementColor(el), el.bgOpacity);
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

    const isTargetOfHover = elements.some((item) => item.showOnHoverId === el.id);
    const isTargetOfClick = elements.some((item) => item.showOnClickId === el.id);

    const isHoverTriggered = hoveredElementId !== null && elements.find((item) => item.id === hoveredElementId)?.showOnHoverId === el.id;
    const isClickTriggered = clickedElementId === el.id;

    const shouldHide = el.isTriggerTarget && (isTargetOfHover || isTargetOfClick) && !isHoverTriggered && !isClickTriggered && !isSelected;

    if (shouldHide) return null;

    return (
      <Rnd
        key={el.id}
        size={{ width: currentWidth, height: currentHeight }}
        position={{ x: el.x, y: el.y }}
        bounds="parent"
        dragGrid={enableGrid ? [10, 10] : [1, 1]}
        resizeGrid={enableGrid ? [10, 10] : [1, 1]}
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
          const nextElements = elements.map((item) => (item.id === el.id ? { ...item, x: d.x, y: d.y } : item));
          updateElementsAndHistory(nextElements);
        }}
        onResizeStop={(e, dir, ref, delta, pos) => {
          e.stopPropagation();
          const nextElements = elements.map((item) =>
            item.id === el.id
              ? {
                  ...item,
                  width: parseInt(ref.style.width),
                  height: parseInt(ref.style.height),
                  x: pos.x,
                  y: pos.y,
                }
              : item
          );
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
              : "border border-black/15 shadow-sm"
          }`}
        >
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
    const children = elements.filter((el) => el.parentId === parentId && (el.isGlobal || el.pageId === currentPageId));
    if (children.length === 0) return null;

    return children.map((el) => {
      const isSelected = selectedIds.includes(el.id);
      const possibleParents = elements.filter(
        (p) => p.type === "block" && (p.isGlobal || p.pageId === currentPageId) && isValidParent(el.id, p.id)
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
                  [{TYPE_LABELS[el.type]}] {el.isGlobal ? "(🌍)" : ""} {el.isTriggerTarget ? "(👁️)" : ""}
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
            🧩 Сітка: {enableGrid ? "УВІМК (10px)" : "ВИМК"}
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
          <div className="flex-1 flex flex-col gap-6 overflow-y-auto p-5">

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
            {pages.length > 1 && (
              <button
                onClick={handleDeleteCurrentPage}
                className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-1 rounded text-[11px] font-medium transition-colors"
              >
                🗑️ Видалити сторінку
              </button>
            )}
          </div>

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
              Ієрархія (Поточна / Глобальна):
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

                    <div className="space-y-2">
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
                      </div>

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
                    </div>
                  </>
                )}

                {/* НАЛАШТУВАННЯ ТРИГЕРІВ (HOVER ТА CLICK) */}
                {singleSelected && (
                  <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-lg space-y-2.5">
                    <span className="font-bold text-[11px] text-indigo-900 uppercase block">
                      ⚡ Тригери появи елементів:
                    </span>
                    <div>
                      <label className="block text-[10px] text-indigo-800 mb-1">Показувати при наведенні (Hover):</label>
                      <select
                        value={singleSelected.showOnHoverId || ""}
                        onChange={(e) => updateSelectedFields("showOnHoverId", e.target.value === "" ? null : Number(e.target.value))}
                        className="w-full p-1.5 border rounded-md text-xs bg-white font-medium text-indigo-900"
                      >
                        <option value="">(Немає)</option>
                        {elements
                          .filter((el) => el.id !== singleSelected.id)
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
                        value={singleSelected.showOnClickId || ""}
                        onChange={(e) => updateSelectedFields("showOnClickId", e.target.value === "" ? null : Number(e.target.value))}
                        className="w-full p-1.5 border rounded-md text-xs bg-white font-medium text-indigo-900"
                      >
                        <option value="">(Немає)</option>
                        {elements
                          .filter((el) => el.id !== singleSelected.id)
                          .map((el) => (
                            <option key={el.id} value={el.id}>
                              [{TYPE_LABELS[el.type]}] {el.content}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* ЖИВІ ЦИФРИ: Позиція та розміри */}
                <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg space-y-2.5">
                  <span className="font-bold text-[11px] text-slate-700 uppercase block">
                    📏 Позиція та розміри (Live):
                  </span>

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

                {/* ТИПОГРАФІКА (ШРИФТИ) */}
                <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2.5">
                  <span className="font-bold text-[11px] text-amber-900 uppercase block">
                    🔤 Типографіка (Шрифти):
                  </span>

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

                {/* ПОВНІ РАЗШИРЕНІ НАЛАШТУВАННЯ КНОПКИ (ПОВЕРНУТО) */}
                {singleSelected?.type === "button" && (
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-3">
                    <span className="font-bold text-[11px] text-blue-900 uppercase block">
                      🔘 Розширені налаштування кнопки:
                    </span>

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
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Padding (px):</label>
                  <input
                    type="number"
                    value={singleSelected ? singleSelected.padding ?? 0 : ""}
                    onChange={(e) => updateSelectedFields("padding", Number(e.target.value))}
                    className="w-full p-1.5 border rounded-md"
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 text-center bg-slate-50/70 border border-dashed rounded-lg text-slate-400 text-xs">
                Виберіть елемент для налаштування
              </div>
            )}
          </div>
          </div>
        </aside>
        </Rnd>

        {/* Полотно на всю сторінку */}
        <main
          onClick={() => {
            handleSelectElement(null);
            setClickedElementId(null);
          }}
          className="absolute inset-0 bg-white overflow-auto"
        >
          {/* ФОН СІТКИ (Динамічний) */}
          <div
            className="absolute inset-0 opacity-60 pointer-events-none transition-all"
            style={{
              backgroundImage: enableGrid
                ? "radial-gradient(#3b82f6 1.5px, transparent 1.5px)"
                : "radial-gradient(#e2e8f0 1px, transparent 1px)",
              backgroundSize: enableGrid ? "10px 10px" : "16px 16px",
            }}
          />
          <div className="relative w-full h-full">
            {elements
              .filter((el) => el.parentId === null && (el.isGlobal || el.pageId === currentPageId))
              .map((el) => renderCanvasNode(el))}
          </div>
        </main>
      </div>
    </div>
  );
}
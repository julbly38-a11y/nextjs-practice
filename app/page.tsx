"use client";

import { useState } from "react";
import { Rnd } from "react-rnd";

type ElementType = "block" | "heading" | "text" | "button";

interface CanvasElement {
  id: number;
  type: ElementType;
  content: string;
  width: number;
  height: number;
  x: number;
  y: number;
  bgColor: string;
  textColor: string;
  padding: number;
  parentId: number | null;
}

const adjustColorBrightness = (hex: string, percent: number) => {
  let num = parseInt(hex.replace("#", ""), 16);
  if (isNaN(num)) return hex;
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00ff) + percent;
  let b = (num & 0x0000ff) + percent;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

export default function AppFixed() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [tempContent, setTempContent] = useState<string>("");

  const [newType, setNewType] = useState<ElementType>("block");
  const [newContent, setNewContent] = useState<string>("Блок");
  
  // Батьківський блок для нового елемента
  const [forcedParentId, setForcedParentId] = useState<number | null>(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedHTMLCode, setImportedHTMLCode] = useState("");

  const selectedElement = elements.find((el) => el.id === selectedId);

  // Універсальна функція вибору елемента з автоматичним оновленням батька для нових елементів
  const handleSelectElement = (id: number | null) => {
    setSelectedId(id);
    if (id !== null) {
      const el = elements.find((item) => item.id === id);
      // Якщо клікнули на блок, робимо його батьком для майбутніх елементів
      if (el && el.type === "block") {
        setForcedParentId(id);
      }
    } else {
      // Якщо зняли виділення (клік на корінь/полотно), скидаємо батька на корінь
      setForcedParentId(null);
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

  const handleAddElement = (e: React.FormEvent) => {
    e.preventDefault();
    const newElement: CanvasElement = {
      id: Date.now(),
      type: newType,
      content: newContent,
      width: forcedParentId ? 160 : 200,
      height: forcedParentId ? 90 : 110,
      x: 1,
      y: 1,
      bgColor: forcedParentId ? "#10b981" : "#3b82f6",
      textColor: "#ffffff",
      padding: 1,
      parentId: forcedParentId,
    };
    setElements([...elements, newElement]);
    handleSelectElement(newElement.id);
  };

  const handleImportHTML = () => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(importedHTMLCode, "text/html");
      const fields = doc.querySelectorAll(".layout-field");

      if (fields.length === 0) {
        alert("Не знайдено елементів з класом .layout-field. Перевірте код.");
        return;
      }

      const newElements: CanvasElement[] = [];
      fields.forEach((field, index) => {
        const style = field.getAttribute("style") || "";
        const className = field.className;
        
        const getStyleVal = (prop: string) => {
          const match = style.match(new RegExp(`${prop}\\s*:\\s*([\\d.]+)px`, "i"));
          return match ? parseInt(match[1]) : null;
        };

        const top = getStyleVal("top");
        const left = getStyleVal("left");
        const width = getStyleVal("width");
        const height = getStyleVal("height");

        const shortName = className.replace("layout-field", "").trim() || `field-${index}`;

        newElements.push({
          id: Date.now() + index,
          type: "block",
          content: shortName,
          width: width !== null ? width : 300,
          height: height !== null ? height : 200,
          x: left !== null ? left : 1,
          y: top !== null ? top : 1,
          bgColor: "#3b82f6",
          textColor: "#ffffff",
          padding: 1,
          parentId: null,
        });
      });

      setElements(newElements);
      setIsImportModalOpen(false);
      setImportedHTMLCode("");
      alert(`Успішно імпортовано полів: ${newElements.length}`);
    } catch (error) {
      alert("Помилка при розборі HTML коду.");
    }
  };

  const updateSelectedField = (field: keyof CanvasElement, value: any) => {
    if (selectedId === null) return;
    setElements((prev) =>
      prev.map((el) => {
        if (el.id === selectedId) {
          const updated = { ...el, [field]: value };
          if (field === "padding") {
            let maxW = 1200;
            let maxH = 800;
            if (updated.parentId !== null) {
              const parent = prev.find((item) => item.id === updated.parentId);
              if (parent) {
                maxW = parent.width;
                maxH = parent.height;
              }
            }
            if (updated.x < value) updated.x = value;
            if (updated.y < value) updated.y = value;
            if (updated.x + updated.width > maxW - value) {
              updated.x = Math.max(value, maxW - value - updated.width);
            }
            if (updated.y + updated.height > maxH - value) {
              updated.y = Math.max(value, maxH - value - updated.height);
            }
          }
          return updated;
        }
        return el;
      })
    );
  };

  const handleSaveRename = (id: number) => {
    if (tempContent.trim() !== "") {
      setElements((prev) =>
        prev.map((el) => (el.id === id ? { ...el, content: tempContent.trim() } : el))
      );
    }
    setEditingId(null);
  };

  const handleDelete = (id: number) => {
    const idsToDelete = new Set<number>([id]);
    
    const findChildren = (targetId: number) => {
      elements.forEach((el) => {
        if (el.parentId === targetId) {
          idsToDelete.add(el.id);
          findChildren(el.id);
        }
      });
    };
    findChildren(id);

    setElements((prev) => prev.filter((el) => !idsToDelete.has(el.id)));

    if (selectedId !== null && idsToDelete.has(selectedId)) {
      handleSelectElement(null);
    }
    if (editingId !== null && idsToDelete.has(editingId)) {
      setEditingId(null);
    }
  };

  const availableParents = elements.filter((el) => el.type === "block");
  const rootElements = elements.filter((el) => el.parentId === null);

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
      alert("Неможливо перемістити блок всередину самого себе чи його власних дочірніх елементів!");
      return;
    }
    setElements((prev) =>
      prev.map((el) => (el.id === elementId ? { ...el, parentId: newParent } : el))
    );
  };

  const renderSidebarTree = (parentId: number | null, depth = 0) => {
    const children = elements.filter((el) => el.parentId === parentId);
    if (children.length === 0) return null;

    return children.map((el) => {
      const isSelected = selectedId === el.id;
      const possibleParents = availableParents.filter((p) => isValidParent(el.id, p.id));
      const isEditing = editingId === el.id;

      return (
        <div key={el.id} className="space-y-1 my-1" style={{ marginLeft: `${depth * 10}px` }}>
          <div
            onClick={() => handleSelectElement(el.id)}
            className={`p-2 rounded cursor-pointer text-xs space-y-1.5 transition-all ${
              isSelected
                ? "bg-blue-600 text-white font-bold shadow-md ring-2 ring-blue-400"
                : el.type === "block"
                ? "bg-slate-100 hover:bg-slate-200 text-slate-800"
                : "bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200"
            }`}
          >
            <div className="flex justify-between items-center">
              <div 
                className="flex items-center gap-1 flex-1 truncate"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingId(el.id);
                  setTempContent(el.content);
                }}
              >
                <span>{el.type === "block" ? "📦" : "📄"}</span>
                {isEditing ? (
                  <input
                    type="text"
                    autoFocus
                    value={tempContent}
                    onChange={(e) => setTempContent(e.target.value)}
                    onBlur={() => handleSaveRename(el.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveRename(el.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-1 py-0.5 bg-white text-slate-900 rounded text-xs border border-blue-400 outline-none"
                  />
                ) : (
                  <span className="truncate" title="Подвійний клік для перейменування">{el.content}</span>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(el.id);
                }}
                className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${
                  isSelected ? "bg-red-500 text-white hover:bg-red-600" : "bg-slate-200 text-slate-700 hover:bg-red-500 hover:text-white"
                }`}
                title="Видалити"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-1 pt-1 border-t border-black/10 text-[10px]">
              <span className={isSelected ? "text-blue-100" : "opacity-75"}>Усередині:</span>
              <select
                value={el.parentId ?? ""}
                onChange={(e) => {
                  e.stopPropagation();
                  changeParent(el.id, e.target.value ? Number(e.target.value) : null);
                }}
                onClick={(e) => e.stopPropagation()}
                className={`w-full p-0.5 rounded border text-[10px] bg-white ${
                  isSelected ? "text-slate-900 font-normal" : "text-slate-700"
                }`}
              >
                <option value="">📁 Корінь (Полотно)</option>
                {possibleParents.map((p) => (
                  <option key={p.id} value={p.id}>📦 {p.content}</option>
                ))}
              </select>
            </div>
          </div>
          {renderSidebarTree(el.id, depth + 1)}
        </div>
      );
    });
  };

  const renderCanvasNode = (el: CanvasElement, containerWidth = 1200, containerHeight = 800) => {
    const children = elements.filter((child) => child.parentId === el.id);
    const isSelected = selectedId === el.id;
    const isBlock = el.type === "block";
    const isEditing = editingId === el.id;

    const depth = getElementDepth(el.id);
    const dynamicBgColor = adjustColorBrightness(el.bgColor, depth * -15);

    const handleDragStop = (e: any, d: any) => {
      e.stopPropagation();
      let newX = d.x;
      let newY = d.y;

      let maxW = containerWidth;
      let maxH = containerHeight;

      if (el.parentId !== null) {
        const parent = elements.find((item) => item.id === el.parentId);
        if (parent) {
          maxW = parent.width;
          maxH = parent.height;
        }
      }

      const minLimit = el.padding;
      const maxLimitX = maxW - el.padding - el.width;
      const maxLimitY = maxH - el.padding - el.height;

      if (newX < minLimit) newX = minLimit;
      if (newY < minLimit) newY = minLimit;
      if (newX > maxLimitX) newX = Math.max(minLimit, maxLimitX);
      if (newY > maxLimitY) newY = Math.max(minLimit, maxLimitY);

      setElements((prev) => prev.map((item) => (item.id === el.id ? { ...item, x: newX, y: newY } : item)));
    };

    const handleResizeStop = (e: any, direction: any, ref: any, delta: any, position: any) => {
      e.stopPropagation();
      let newWidth = parseInt(ref.style.width);
      let newHeight = parseInt(ref.style.height);
      let newX = position.x;
      let newY = position.y;

      let maxW = containerWidth;
      let maxH = containerHeight;

      if (el.parentId !== null) {
        const parent = elements.find((item) => item.id === el.parentId);
        if (parent) {
          maxW = parent.width;
          maxH = parent.height;
        }
      }

      const minLimit = el.padding;
      const maxAllowedWidth = maxW - el.padding - newX;
      const maxAllowedHeight = maxH - el.padding - newY;

      if (newX < minLimit) {
        newWidth -= (minLimit - newX);
        newX = minLimit;
      }
      if (newY < minLimit) {
        newHeight -= (minLimit - newY);
        newY = minLimit;
      }

      if (newWidth > maxAllowedWidth) newWidth = Math.max(40, maxAllowedWidth);
      if (newHeight > maxAllowedHeight) newHeight = Math.max(40, maxAllowedHeight);

      setElements((prev) =>
        prev.map((item) =>
          item.id === el.id
            ? { ...item, width: newWidth, height: newHeight, x: newX, y: newY }
            : item
        )
      );
    };

    return (
      <Rnd
        key={el.id}
        size={{ width: el.width, height: el.height }}
        position={{ x: el.x, y: el.y }}
        onDragStart={(e) => {
          e.stopPropagation();
          handleSelectElement(el.id);
        }}
        onDragStop={handleDragStop}
        onResizeStart={(e) => {
          e.stopPropagation();
          handleSelectElement(el.id);
        }}
        onResizeStop={handleResizeStop}
        enableResizing={true}
        className="group absolute"
        style={{ zIndex: isSelected ? 40 : 10 }}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
            handleSelectElement(el.id);
          }}
          style={{
            backgroundColor: dynamicBgColor,
            color: el.textColor,
            width: "100%",
            height: "100%",
          }}
          className={`rounded shadow-sm text-xs font-medium relative box-border transition-all overflow-hidden ${
            isSelected ? "ring-2 ring-blue-600 ring-offset-1 shadow-md" : "border border-black/15"
          }`}
        >
          <div className="absolute top-0.5 left-0.5 right-0.5 flex justify-between items-center bg-black/30 backdrop-blur-sm px-1 py-0.5 rounded opacity-60 group-hover:opacity-100 transition-opacity z-50 pointer-events-auto">
            <div 
              className="flex items-center gap-1 flex-1 truncate mr-1 cursor-text"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingId(el.id);
                setTempContent(el.content);
              }}
            >
              <span className="shrink-0">{isBlock ? "📦" : "📄"}</span>
              {isEditing ? (
                <input
                  type="text"
                  autoFocus
                  value={tempContent}
                  onChange={(e) => setTempContent(e.target.value)}
                  onBlur={() => handleSaveRename(el.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename(el.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-1 py-0.5 bg-white text-slate-900 rounded text-[10px] border border-blue-400 outline-none"
                />
              ) : (
                <span className="font-bold text-[10px] truncate" title="Подвійний клік для перейменування">
                  {el.content} (р.{depth})
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(el.id);
              }}
              className="bg-red-500 text-white rounded-full w-3 h-3 flex items-center justify-center text-[8px] hover:bg-red-600 shrink-0"
            >
              ✕
            </button>
          </div>

          <div 
            className="absolute inset-0 pointer-events-none"
            style={{ padding: `${el.padding}px` }}
          >
            <div className="relative w-full h-full pointer-events-auto">
              {children.map((child) => renderCanvasNode(child, el.width, el.height))}
            </div>
          </div>
        </div>
      </Rnd>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 text-slate-800 font-sans relative">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">
            Кабінет Завідувача (Конструктор МІС)
          </h1>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-mono">автоматичний вибір батька</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded border border-indigo-200 hover:bg-indigo-100 transition-colors"
          >
            📥 Імпортувати HTML
          </button>
        </div>
      </header>

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Імпорт розмітки полів (HTML)</h3>
            <p className="text-xs text-slate-500">
              Вставте шматок коду з класами <code className="bg-slate-100 p-0.5 rounded">.layout-field</code> та стилями розташування.
            </p>
            <textarea
              rows={8}
              value={importedHTMLCode}
              onChange={(e) => setImportedHTMLCode(e.target.value)}
              placeholder='<div class="layout-field lf-left-top" style="top:231px; left:20px; width:545px; height:270px;"></div>'
              className="w-full p-3 border border-slate-300 rounded-lg text-xs font-mono"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setIsImportModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg">
                Скасувати
              </button>
              <button onClick={handleImportHTML} className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700">
                Завантажити на полотно
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 p-6 gap-6">
        <aside className="w-80 bg-white p-5 rounded-xl border border-slate-200 shadow-sm shrink-0 flex flex-col gap-6 overflow-y-auto max-h-[85vh]">
          <form onSubmit={handleAddElement} className="space-y-3 pb-4 border-b">
            <h2 className="font-bold text-slate-900 text-sm">Додати елемент</h2>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Батьківський блок:</label>
              <select
                value={forcedParentId ?? ""}
                onChange={(e) => setForcedParentId(e.target.value ? Number(e.target.value) : null)}
                className="w-full p-1.5 border border-slate-300 rounded-md bg-white text-xs font-medium text-blue-700"
              >
                <option value="">📁 Головне полотно (Корінь)</option>
                {availableParents.map((p) => (
                  <option key={p.id} value={p.id}>📦 Всередину: {p.content}</option>
                ))}
              </select>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                * Змінюється автоматично при кліку на блок
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Тип:</label>
                <select value={newType} onChange={(e) => setNewType(e.target.value as ElementType)} className="w-full p-1.5 border rounded-md text-xs bg-white">
                  <option value="block">Блок</option>
                  <option value="heading">Заголовок</option>
                  <option value="text">Текст</option>
                  <option value="button">Кнопка</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Назва:</label>
                <input type="text" value={newContent} onChange={(e) => setNewContent(e.target.value)} required className="w-full p-1.5 border rounded-md text-xs" />
              </div>
            </div>

            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 rounded-md text-xs shadow-sm">
              + Створити елемент у вибраному
            </button>
          </form>

          <div className="space-y-2 pb-4 border-b">
            <h2 className="font-bold text-slate-900 text-xs uppercase text-slate-500">Структура і переміщення:</h2>
            <div className="space-y-1 text-xs">
              {elements.length === 0 && <span className="text-slate-400 italic">Немає елементів</span>}
              {renderSidebarTree(null)}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="font-bold text-slate-900 text-sm">Параметри виділеного</h2>
            {selectedElement ? (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Назва / Текст поля:</label>
                  <input
                    type="text"
                    value={selectedElement.content}
                    onChange={(e) => updateSelectedField("content", e.target.value)}
                    className="w-full p-1.5 border rounded-md font-semibold text-blue-700 bg-blue-50/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Ширина:</label>
                    <input type="number" value={selectedElement.width} onChange={(e) => updateSelectedField("width", Number(e.target.value))} className="w-full p-1.5 border rounded-md" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Висота:</label>
                    <input type="number" value={selectedElement.height} onChange={(e) => updateSelectedField("height", Number(e.target.value))} className="w-full p-1.5 border rounded-md" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Позиція X:</label>
                    <input type="number" value={selectedElement.x} onChange={(e) => updateSelectedField("x", Number(e.target.value))} className="w-full p-1.5 border rounded-md" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Позиція Y:</label>
                    <input type="number" value={selectedElement.y} onChange={(e) => updateSelectedField("y", Number(e.target.value))} className="w-full p-1.5 border rounded-md" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Відступ (Padding): <span className="font-bold text-blue-600">{selectedElement.padding}px</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={selectedElement.padding}
                    onChange={(e) => updateSelectedField("padding", Number(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Базовий фон:</label>
                    <input type="color" value={selectedElement.bgColor} onChange={(e) => updateSelectedField("bgColor", e.target.value)} className="w-full h-8 rounded border cursor-pointer" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Текст:</label>
                    <input type="color" value={selectedElement.textColor} onChange={(e) => updateSelectedField("textColor", e.target.value)} className="w-full h-8 rounded border cursor-pointer" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-slate-400 text-xs italic bg-slate-50 p-3 rounded border text-center">
                Оберіть елемент для редагування.
              </div>
            )}
          </div>
        </aside>

        <main 
          onClick={() => handleSelectElement(null)}
          className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm relative overflow-hidden min-h-[600px] p-[1px] cursor-default"
        >
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

          <div className="relative w-full h-full">
            {elements.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                Полотно порожнє. Імпортуйте розмітку через кнопку вгорі або створіть вручну.
              </div>
            ) : (
              rootElements.map((el) => renderCanvasNode(el, 1200, 800))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
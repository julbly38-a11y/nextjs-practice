"use client";

import { useState } from "react";
import { Rnd } from "react-rnd";

type ViewState = "login" | "intermediate" | "cabinet";
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

export default function AppFixed() {
  const [currentView, setCurrentView] = useState<ViewState>("login");
  const [email, setEmail] = useState("manager@hospital.com");
  const [password, setPassword] = useState("123");
  const [role, setRole] = useState<"manager" | "doctor">("manager");

  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [newType, setNewType] = useState<ElementType>("block");
  const [newContent, setNewContent] = useState<string>("Блок");
  const [newParentId, setNewParentId] = useState<number | null>(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedHTMLCode, setImportedHTMLCode] = useState("");

  const selectedElement = elements.find((el) => el.id === selectedId);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentView("intermediate");
    setTimeout(() => {
      setRole(email.includes("manager") ? "manager" : "doctor");
      setCurrentView("cabinet");
    }, 1200);
  };

  const handleAddElement = (e: React.FormEvent) => {
    e.preventDefault();
    const newElement: CanvasElement = {
      id: Date.now(),
      type: newType,
      content: newContent,
      width: 180,
      height: 90,
      x: newParentId ? 20 : 40,
      y: newParentId ? 20 : 40,
      bgColor: newParentId ? "#10b981" : "#3b82f6",
      textColor: "#ffffff",
      padding: 10,
      parentId: newParentId,
    };
    setElements([...elements, newElement]);
    setSelectedId(newElement.id);
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
          x: left !== null ? left : 20,
          y: top !== null ? top : 20,
          bgColor: "#3b82f6",
          textColor: "#ffffff",
          padding: 10,
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
      prev.map((el) => (el.id === selectedId ? { ...el, [field]: value } : el))
    );
  };

  const handleDelete = (id: number) => {
    setElements(elements.filter((el) => el.id !== id && el.parentId !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const availableParents = elements.filter((el) => el.type === "block" && el.parentId === null);
  const rootElements = elements.filter((el) => el.parentId === null);

  if (currentView === "login") {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center font-sans">
        <div className="bg-white p-8 rounded-xl shadow-md w-96 space-y-6">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Вхід у систему МІС</h1>
            <p className="text-xs text-slate-500 mt-1">Оберіть тестовий акаунт для швидкого входу:</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setEmail("manager@hospital.com"); setPassword("123"); }}
              className="p-2 text-xs bg-blue-50 text-blue-700 font-semibold rounded border border-blue-200 hover:bg-blue-100 transition-colors text-left"
            >
              👔 Завідувач<br/>
              <span className="text-[10px] font-normal opacity-75">manager@hospital.com</span>
            </button>
            <button
              type="button"
              onClick={() => { setEmail("doctor@hospital.com"); setPassword("123"); }}
              className="p-2 text-xs bg-emerald-50 text-emerald-700 font-semibold rounded border border-emerald-200 hover:bg-emerald-100 transition-colors text-left"
            >
              🩺 Лікар<br/>
              <span className="text-[10px] font-normal opacity-75">doctor@hospital.com</span>
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 pt-2 border-t">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email:</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Пароль:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded text-sm"
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded text-sm shadow-sm">
              Увійти в систему
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (currentView === "intermediate") {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center font-sans">
        <div className="bg-white p-8 rounded-xl shadow-md w-96 text-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <h2 className="text-lg font-bold text-slate-800">Авторизація успішна!</h2>
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 text-slate-800 font-sans relative">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">
            {role === "manager" ? "Кабінет Завідувача (Конструктор)" : "Кабінет Лікаря"}
          </h1>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-mono">{email}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded border border-indigo-200 hover:bg-indigo-100 transition-colors"
          >
            📥 Імпортувати HTML
          </button>
          <button onClick={() => setCurrentView("login")} className="px-3 py-1.5 bg-red-100 text-red-600 text-xs font-semibold rounded hover:bg-red-200">
            Вийти
          </button>
        </div>
      </header>

      {/* МОДАЛЬНЕ ВІКНО ІМПОРТУ */}
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
                value={newParentId ?? ""}
                onChange={(e) => setNewParentId(e.target.value ? Number(e.target.value) : null)}
                className="w-full p-1.5 border border-slate-300 rounded-md bg-white text-xs"
              >
                <option value="">📁 Головне полотно (Батько)</option>
                {availableParents.map((p) => (
                  <option key={p.id} value={p.id}>📦 Всередину: {p.content}</option>
                ))}
              </select>
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
              + Створити елемент
            </button>
          </form>

          {/* Структура сторінки */}
          <div className="space-y-2 pb-4 border-b">
            <h2 className="font-bold text-slate-900 text-xs uppercase text-slate-500">Структура сторінки:</h2>
            <div className="space-y-1 text-xs">
              {elements.length === 0 && <span className="text-slate-400 italic">Немає елементів</span>}
              {rootElements.map((parent) => {
                const children = elements.filter((c) => c.parentId === parent.id);
                return (
                  <div key={parent.id} className="space-y-1">
                    <div
                      onClick={() => setSelectedId(parent.id)}
                      className={`p-1.5 rounded cursor-pointer flex justify-between items-center ${
                        selectedId === parent.id ? "bg-blue-600 text-white font-bold" : "bg-slate-100 hover:bg-slate-200"
                      }`}
                    >
                      <span>📦 {parent.content}</span>
                    </div>
                    {children.map((child) => (
                      <div
                        key={child.id}
                        onClick={() => setSelectedId(child.id)}
                        className={`ml-4 p-1.5 rounded cursor-pointer flex justify-between items-center ${
                          selectedId === child.id ? "bg-emerald-600 text-white font-bold" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200"
                        }`}
                      >
                        <span>↳ 📄 {child.content}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Редагування назви та параметрів виділеного */}
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
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Відступ (Padding): {selectedElement.padding}px</label>
                  <input type="range" min="0" max="40" value={selectedElement.padding} onChange={(e) => updateSelectedField("padding", Number(e.target.value))} className="w-full cursor-pointer" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Фон:</label>
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

        {/* Полотно */}
        <main className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm relative overflow-hidden min-h-[600px]">
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

          {elements.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
              Полотно порожнє. Імпортуйте розмітку через кнопку вгорі або створіть вручну.
            </div>
          ) : (
            rootElements.map((el) => {
              const children = elements.filter((child) => child.parentId === el.id);
              const isSelected = selectedId === el.id;

              return (
                <Rnd
                  key={el.id}
                  size={{ width: el.width, height: el.height }}
                  position={{ x: el.x, y: el.y }}
                  onDragStart={() => setSelectedId(el.id)}
                  onDragStop={(e, d) => {
                    setElements((prev) => prev.map((item) => (item.id === el.id ? { ...item, x: d.x, y: d.y } : item)));
                  }}
                  onResizeStart={() => setSelectedId(el.id)}
                  onResizeStop={(e, direction, ref, delta, position) => {
                    setElements((prev) =>
                      prev.map((item) =>
                        item.id === el.id
                          ? { ...item, width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: position.x, y: position.y }
                          : item
                      )
                    );
                  }}
                  bounds="parent"
                  className="group cursor-move"
                >
                  <div
                    onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                    style={{
                      backgroundColor: el.bgColor,
                      color: el.textColor,
                      padding: `${el.padding}px`,
                      width: "100%",
                      height: "100%",
                    }}
                    className={`rounded-lg shadow-md text-xs font-medium relative overflow-hidden box-border flex flex-col transition-all ${
                      isSelected ? "ring-2 ring-blue-600 ring-offset-2 shadow-lg" : "border border-black/10"
                    }`}
                  >
                    {/* Шапка блоку (не заважає дочірнім елементам вирівнюватись зверху) */}
                    <div className="font-bold flex justify-between items-center mb-1 bg-black/10 px-1.5 py-0.5 rounded shrink-0">
                      <span>📦 {el.content}</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(el.id); }} className="bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] opacity-0 group-hover:opacity-100">
                        ✕
                      </button>
                    </div>

                    <div className="relative w-full flex-1">
                      {children.map((child) => {
                        const isChildSelected = selectedId === child.id;

                        return (
                          <Rnd
                            key={child.id}
                            size={{ width: child.width, height: child.height }}
                            position={{ x: child.x, y: child.y }}
                            onDragStart={() => setSelectedId(child.id)}
                            onDragStop={(e, d) => {
                              setElements((prev) => prev.map((item) => (item.id === child.id ? { ...item, x: d.x, y: d.y } : item)));
                            }}
                            onResizeStart={() => setSelectedId(child.id)}
                            onResizeStop={(e, direction, ref, delta, position) => {
                              setElements((prev) =>
                                prev.map((item) =>
                                  item.id === child.id
                                    ? { ...item, width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: position.x, y: position.y }
                                    : item
                                )
                              );
                            }}
                            bounds="parent"
                            className="group/child cursor-move absolute"
                          >
                            <div
                              onClick={(e) => { e.stopPropagation(); setSelectedId(child.id); }}
                              style={{
                                backgroundColor: child.bgColor,
                                color: child.textColor,
                                padding: `${child.padding}px`,
                                width: "100%",
                                height: "100%",
                              }}
                              className={`rounded shadow-sm text-center flex flex-col items-center justify-center relative box-border transition-all ${
                                isChildSelected ? "ring-2 ring-blue-600 ring-offset-1 shadow-md" : "border border-black/10"
                              }`}
                            >
                              <span className="font-bold">↳ {child.content}</span>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(child.id); }} className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] opacity-0 group-hover/child:opacity-100 z-10">
                                ✕
                              </button>
                            </div>
                          </Rnd>
                        );
                      })}
                    </div>
                  </div>
                </Rnd>
              );
            })
          )}
        </main>
      </div>
    </div>
  );
}
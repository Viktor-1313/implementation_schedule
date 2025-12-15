# Исправления для работы с этапами

## Изменения, которые нужно внести:

### 1. Добавить переменную selectedStage
**Точное место:** В файле `implementation_schedule.html` после строки 7287 (после `let copiedTask = null; // скопированная задача для вставки`), перед строкой 7290 (перед `// Флаг и ссылка на модал удаления`).

**Примечание:** Переменная `selectedStage` уже существует на строке 7289. Если она уже есть, этот пункт можно пропустить.
```javascript
        let copiedTask = null; // скопированная задача для вставки
        // Выделение этапа
        let selectedStage = null; // название выделенного этапа (например, "Этап 1. Формирование цифровой модели")
        // Флаг и ссылка на модал удаления
```

### 2. Изменить обработчик клика на метку этапа
**Точное место:** В файле `implementation_schedule.html` найти обработчик клика на метку этапа (примерно строка 12565). Если уже есть новый обработчик с `clickTimer`, то этот пункт можно пропустить.
Заменить:
```javascript
                    stageLabel.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleStageCollapse(stageName);
                    });
```

На:
```javascript
                    // Обработчик двойного клика для переименования
                    let clickTimer = null;
                    stageLabel.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (clickTimer === null) {
                            clickTimer = setTimeout(() => {
                                // Одиночный клик - выделение этапа
                                selectedTaskIds.clear();
                                selectedStage = stageName;
                                applyStageSelection();
                                clickTimer = null;
                            }, 300);
                        } else {
                            // Двойной клик - переименование
                            clearTimeout(clickTimer);
                            clickTimer = null;
                            openRenameStageModal(stageName);
                        }
                    });
                    
                    // Обработчик двойного клика
                    stageLabel.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        if (clickTimer) {
                            clearTimeout(clickTimer);
                            clickTimer = null;
                        }
                        openRenameStageModal(stageName);
                    });
```

### 3. Добавить функцию applyStageSelection
**Точное место:** В файле `implementation_schedule.html` после строки 7844 (конец функции `applySelectionHighlight`), перед строкой 7860 (начало функции `clearSelection`).

**Примечание:** Функция `applyStageSelection` уже существует на строке 7846. Если она уже есть, этот пункт можно пропустить.
```javascript
        function applyStageSelection() {
            // Убираем выделение со всех меток этапов
            document.querySelectorAll('.gantt-stage-label').forEach(label => {
                label.classList.remove('selected');
            });
            
            // Выделяем выбранный этап
            if (selectedStage) {
                const stageLabel = document.querySelector(`.gantt-stage-label[data-stage-name="${selectedStage}"]`);
                if (stageLabel) {
                    stageLabel.classList.add('selected');
                }
            }
        }
```

### 4. Изменить функцию insertTaskBelowSelected
**Точное место:** В файле `implementation_schedule.html` функция начинается на строке 14698. Добавить проверку на выделенный этап ПОСЛЕ строки 14700 (после `return; // Блокируем добавление задач в режиме просмотра`), ПЕРЕД строкой 14708 (перед `// Сохраняем состояние в историю...`).

**Примечание:** Если проверка на `selectedStage` уже есть на строке 14703, то этот пункт можно пропустить.

Вставить код:
```javascript
            // Если выделен этап, вставляем новый этап
            if (selectedStage) {
                insertNewStage(selectedStage);
                return;
            }
            
```

### 5. Добавить функцию insertNewStage
**Точное место:** В файле `implementation_schedule.html` после строки 14810 (после закрывающей скобки функции `insertTaskBelowSelected`), перед строкой 14889 (перед функцией `deleteSelectedTask`).

Вставить код:
```javascript
        function insertNewStage(afterStageName) {
            addToUndoHistory();
            
            // Находим индекс последней задачи этапа
            const stageTasks = tasks.filter(t => t.stage === afterStageName);
            if (stageTasks.length === 0) return;
            
            const lastTask = stageTasks[stageTasks.length - 1];
            const lastIndex = tasks.findIndex(t => t.id === lastTask.id);
            if (lastIndex === -1) return;
            
            // Определяем номер нового этапа
            const stageMatch = afterStageName.match(/^(Этап\s+)(\d+)/);
            let newStageNumber = 1;
            if (stageMatch) {
                newStageNumber = parseInt(stageMatch[2]) + 1;
            } else {
                // Если формат не стандартный, ищем максимальный номер
                const allStages = [...new Set(tasks.map(t => t.stage).filter(Boolean))];
                const numbers = allStages.map(s => {
                    const m = s.match(/^(Этап\s+)(\d+)/);
                    return m ? parseInt(m[2]) : 0;
                });
                newStageNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
            }
            
            const newStageName = `Этап ${newStageNumber}. Новый этап`;
            
            // Создаем новую задачу для нового этапа
            let newStart = new Date(lastTask.endDate);
            do {
                newStart.setDate(newStart.getDate() + 1);
            } while (!isWorkday(newStart));
            
            const newDates = getTaskDates(newStart, 1);
            
            const newTask = {
                id: nextTaskId++,
                stage: newStageName,
                control: '',
                task: 'Новая задача',
                days: 1,
                substage: '',
                startDate: newDates[0],
                endDate: newDates[newDates.length - 1],
                dates: newDates,
                status: 'pending',
                dateStatuses: {},
                link: 'О_Н',
                responsible: '',
                onTravel: false
            };
            
            // Вставляем новую задачу после последней задачи этапа
            tasks.splice(lastIndex + 1, 0, newTask);
            
            // Обновляем stageConfig
            if (!stageConfig.includes(newStageName)) {
                stageConfig.push(newStageName);
                stageConfig.sort();
            }
            
            // Пересчитываем связи
            recalculateFollowingTasks(lastIndex + 1);
            
            // Выделяем новый этап
            selectedStage = newStageName;
            selectedTaskIds.clear();
            
            updateStatistics();
            renderGantt();
            renderTable();
            renderStageTabs();
            applyStageSelection();
        }
```

### 6. Добавить CSS для выделенного этапа
**Точное место:** В файле `implementation_schedule.html` после строки 2811 (после закрывающей скобки стиля `.gantt-stage-label:hover`), перед строкой 2813 (перед комментарием `/* Кастомная подсказка для меток этапов */`).

**Важно:** В файле `implementation_schedule.html` стиля `.gantt-stage-label.selected` НЕТ, его нужно добавить.

Вставить код:
```css
        .gantt-stage-label.selected {
            background: rgba(30, 136, 229, 0.3);
            border-right: 3px solid var(--color-primary);
            font-weight: 700;
        }
        
        [data-theme="dark"] .gantt-stage-label.selected {
            background: rgba(66, 165, 245, 0.3);
            border-right: 3px solid var(--color-primary);
        }
```

### 7. Изменить функцию selectTask для сброса выделения этапа
**Точное место:** В файле `implementation_schedule.html` функция начинается на строке 7875. Добавить код ПОСЛЕ строки 7876 (после `const { range = false, preserveSelection = false } = options;`), ПЕРЕД строкой 7878 (перед `if (range && lastSelectedTaskId !== null) {`).

Вставить код:
```javascript
            // Сбрасываем выделение этапа при выделении задачи
            if (selectedStage) {
                selectedStage = null;
                applyStageSelection();
            }
            
```

### 8. Добавить drag & drop для этапов
Это более сложное изменение, требующее переработки логики перемещения задач по этапам.

### 9. Исправить удаление этапов по клавише Delete
**Проблема:** При выделении этапа и нажатии Delete ничего не происходит.

**Точное место:** В файле `implementation_schedule.html` найти обработчик клавиши Delete (примерно строка 25328, где проверяется `event.key === 'Delete'`). 

**Исправление:** Добавить проверку на выделенный этап ПЕРЕД вызовом `openDeleteConfirm()`. Если выделен этап, вызывать `openStageDeleteModal(selectedStage)` вместо `openDeleteConfirm()`.

Найти код:
```javascript
                // Удаление выбранной задачи по клавише Delete (с подтверждением)
                if (event.key === 'Delete') {
                    if (!canEdit()) {
                        return; // Блокируем Delete в режиме просмотра
                    }
                    const target = event.target;
                    if (
                        target instanceof HTMLInputElement ||
                        target instanceof HTMLTextAreaElement ||
                        target instanceof HTMLSelectElement ||
                        target.isContentEditable
                    ) {
                        return;
                    }
                    event.preventDefault();
                    openDeleteConfirm();
                    return;
                }
```

Заменить на:
```javascript
                // Удаление выбранной задачи по клавише Delete (с подтверждением)
                if (event.key === 'Delete') {
                    if (!canEdit()) {
                        return; // Блокируем Delete в режиме просмотра
                    }
                    const target = event.target;
                    if (
                        target instanceof HTMLInputElement ||
                        target instanceof HTMLTextAreaElement ||
                        target instanceof HTMLSelectElement ||
                        target.isContentEditable
                    ) {
                        return;
                    }
                    event.preventDefault();
                    
                    // Если выделен этап, удаляем этап
                    if (selectedStage) {
                        openStageDeleteModal(selectedStage);
                        return;
                    }
                    
                    // Иначе удаляем выделенные задачи
                    openDeleteConfirm();
                    return;
                }
```

### 10. Исправить обновление интерфейса при переименовании этапа
**Проблема:** При переименовании этапа новое название применяется только после перезагрузки страницы.

**Точное место:** В файле `implementation_schedule.html` найти функцию `renameStage` (примерно строка 21640).

**Исправление:** Добавить вызовы `renderGantt()` и `renderTable()` после `initializeTasks()`, чтобы интерфейс обновлялся сразу.

Найти код:
```javascript
        async function renameStage(oldShortName, newShortName) {
            stageConfig = stageConfig.map(name => name === oldShortName ? newShortName : name);

            projectData.forEach(item => {
                if (!item.stage) return;
                if (item.stage.startsWith(oldShortName)) {
                    item.stage = newShortName + item.stage.slice(oldShortName.length);
                }
            });

            if (currentStageFilter === oldShortName) {
                currentStageFilter = newShortName;
            }

            await initializeTasks();
            renderStageTabs();
            buildStageSettingsList();
        }
```

Заменить на:
```javascript
        async function renameStage(oldShortName, newShortName) {
            stageConfig = stageConfig.map(name => name === oldShortName ? newShortName : name);

            projectData.forEach(item => {
                if (!item.stage) return;
                if (item.stage.startsWith(oldShortName)) {
                    item.stage = newShortName + item.stage.slice(oldShortName.length);
                }
            });

            if (currentStageFilter === oldShortName) {
                currentStageFilter = newShortName;
            }

            await initializeTasks();
            renderGantt();
            renderTable();
            renderStageTabs();
            buildStageSettingsList();
            applyStageSelection(); // Обновляем выделение этапа, если он был выделен
        }
```

### 11. Исправить обновление интерфейса при удалении этапа
**Проблема:** При удалении этапа изменения применяются только после перезагрузки страницы.

**Точное место:** В файле `implementation_schedule.html` найти функцию `deleteStage` (примерно строка 21594).

**Исправление:** Добавить вызовы `renderGantt()` и `renderTable()` после `initializeTasks()`, а также сбросить выделение этапа, если удаленный этап был выделен.

Найти код:
```javascript
        async function deleteStage(shortName) {
            stageConfig = stageConfig.filter(name => name !== shortName);
            projectData = projectData.filter(item => !item.stage || !item.stage.startsWith(shortName));

            if (currentStageFilter === shortName) {
                currentStageFilter = 'all';
            }

            await initializeTasks();
            renderStageTabs();
            buildStageSettingsList();
        }
```

Заменить на:
```javascript
        async function deleteStage(shortName) {
            stageConfig = stageConfig.filter(name => name !== shortName);
            projectData = projectData.filter(item => !item.stage || !item.stage.startsWith(shortName));

            if (currentStageFilter === shortName) {
                currentStageFilter = 'all';
            }

            // Сбрасываем выделение этапа, если удаленный этап был выделен
            if (selectedStage === shortName || selectedStage && selectedStage.startsWith(shortName)) {
                selectedStage = null;
            }

            await initializeTasks();
            renderGantt();
            renderTable();
            renderStageTabs();
            buildStageSettingsList();
            applyStageSelection(); // Обновляем выделение этапов
        }
```

### 12. Скрыть кнопку "Редакция этапов"
**Цель:** Скрыть кнопку "Редакция этапов" в интерфейсе.

**Вариант 1 (рекомендуется):** Добавить CSS для скрытия кнопки.

**Точное место:** В файле `implementation_schedule.html` найти стили для `.stage-settings-btn` (примерно строка 4328) и добавить правило `display: none;` или добавить новое правило в конец секции стилей.

Добавить код:
```css
        /* Скрытие кнопки "Редакция этапов" */
        .stage-settings-btn {
            display: none !important;
        }
```

**Вариант 2:** Закомментировать HTML-код кнопки.

**Точное место:** В файле `implementation_schedule.html` найти кнопку на строках 6193-6202.

Найти код:
```html
                <button class="stage-settings-btn" onclick="openStageSettingsModal(event)" data-tooltip="Редакция этапов">
                    <span class="stage-settings-icon">
                        <span class="stage-settings-bar stage-settings-bar-1"></span>
                        <span class="stage-settings-bar stage-settings-bar-2"></span>
                        <span class="stage-settings-bar stage-settings-bar-3"></span>
                        <span class="stage-settings-knob stage-settings-knob-1"></span>
                        <span class="stage-settings-knob stage-settings-knob-2"></span>
                        <span class="stage-settings-knob stage-settings-knob-3"></span>
                    </span>
                </button>
```

Закомментировать:
```html
                <!-- <button class="stage-settings-btn" onclick="openStageSettingsModal(event)" data-tooltip="Редакция этапов">
                    <span class="stage-settings-icon">
                        <span class="stage-settings-bar stage-settings-bar-1"></span>
                        <span class="stage-settings-bar stage-settings-bar-2"></span>
                        <span class="stage-settings-bar stage-settings-bar-3"></span>
                        <span class="stage-settings-knob stage-settings-knob-1"></span>
                        <span class="stage-settings-knob stage-settings-knob-2"></span>
                        <span class="stage-settings-knob stage-settings-knob-3"></span>
                    </span>
                </button> -->
```

**Рекомендация:** Использовать Вариант 1 (CSS), так как он не изменяет структуру HTML и кнопку можно легко вернуть, убрав правило CSS.

### 13. Исправить проблему с фиксацией столбцов при горизонтальном скролле
**Проблема:** При горизонтальном скролле зафиксированные столбцы уезжают влево и исчезают из видимости.

**Причина:** Функция `updateStickyColumns()` не вызывается при скролле, и позиции `left` не пересчитываются. Также может быть проблема с родительским контейнером, который имеет `overflow` или `transform`, что ломает работу `position: sticky`.

**Точное место:** В файле `implementation_schedule.html` найти функцию `updateStickyColumns` (строка 10067) и добавить обработчик скролла.

**Исправление 1:** Добавить обработчик скролла для пересчета позиций sticky столбцов.

Найти место после функции `updateStickyColumns` (примерно после строки 10161) и добавить:

```javascript
        // Обработчик скролла для обновления позиций sticky столбцов
        const ganttChart = document.getElementById('ganttChart');
        if (ganttChart) {
            // Удаляем старый обработчик, если есть
            ganttChart.removeEventListener('scroll', updateStickyColumnsOnScroll);
            
            // Добавляем новый обработчик с throttling для производительности
            let scrollTimeout = null;
            function updateStickyColumnsOnScroll() {
                if (scrollTimeout) return;
                scrollTimeout = requestAnimationFrame(() => {
                    updateStickyColumns();
                    scrollTimeout = null;
                });
            }
            
            ganttChart.addEventListener('scroll', updateStickyColumnsOnScroll, { passive: true });
        }
```

**Исправление 2:** Убедиться, что `updateStickyColumns()` вызывается после каждого `renderGantt()` и `renderTable()`.

**Основные места для добавления `updateStickyColumns()`:**

1. **В обработчике клика для разворачивания этапа (строка 12853):**
   Найти код на строках 12842-12854:
   ```javascript
            // Добавляем обработчик клика для разворачивания этапа
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                // Переключаем состояние этапа и перерисовываем
                const isCollapsed = collapsedStages.has(stageName);
                if (isCollapsed) {
                    collapsedStages.delete(stageName);
                } else {
                    collapsedStages.add(stageName);
                }
                renderGantt();
                renderTable();
            });
   ```
   
   Заменить на:
   ```javascript
            // Добавляем обработчик клика для разворачивания этапа
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                // Переключаем состояние этапа и перерисовываем
                const isCollapsed = collapsedStages.has(stageName);
                if (isCollapsed) {
                    collapsedStages.delete(stageName);
                } else {
                    collapsedStages.add(stageName);
                }
                renderGantt();
                renderTable();
                updateStickyColumns(); // Обновляем позиции sticky столбцов
            });
   ```

2. **В конце функции `renderTable()` (перед строкой 13551):**
   Найти конец функции `renderTable()` (примерно строка 13548, перед закрывающей скобкой на строке 13551):
   ```javascript
            // Восстанавливаем подсветку поиска после перерисовки таблицы
            if (searchResults.length > 0) {
                highlightSearchResults();
            }
        }
   ```
   
   Заменить на:
   ```javascript
            // Восстанавливаем подсветку поиска после перерисовки таблицы
            if (searchResults.length > 0) {
                highlightSearchResults();
            }
            
            // Обновляем позиции sticky столбцов после перерисовки таблицы
            updateStickyColumns();
        }
   ```

3. **После `renderGantt()` в функции `renderGantt()` (строка 12646 - уже есть):**
   Проверить, что там уже есть вызов `updateStickyColumns()`. Если нет - добавить после строки 12646.

**Важно:** После добавления `updateStickyColumns()` в эти места, sticky столбцы будут правильно обновляться при любых изменениях интерфейса.

**Исправление 3 (если проблема сохраняется):** Проверить CSS родительского контейнера.

Убедиться, что контейнер `.gantt-chart` или его родители не имеют:
- `transform: translateX()` или другие transform
- `overflow: hidden` (должен быть `overflow-x: auto` или `overflow: auto`)
- `will-change: transform`

Если есть такие стили, их нужно убрать или изменить.

**Альтернативное решение:** Если проблема критична, можно использовать `position: fixed` вместо `sticky`, но это потребует переработки логики позиционирования.

### 14. Оценка сложности реализации drag & drop для этапов

**Текущая реализация drag & drop для задач:**
- Задачи уже имеют drag & drop (строки 11010-11042)
- Используется стандартный HTML5 Drag & Drop API
- При перетаскивании задачи перемещаются в массиве `tasks`
- Автоматически пересчитываются даты и связи

**Сложность реализации drag & drop для этапов: ОСРЕДНЕННАЯ-ВЫСОКАЯ**

**Что нужно реализовать:**

1. **Визуальная часть (простая):**
   - Сделать метки этапов (`.gantt-stage-label`) или строки этапов draggable
   - Добавить визуальные индикаторы при перетаскивании (подсветка места вставки)

2. **Логика перемещения (средняя сложность):**
   - При перетаскивании этапа нужно переместить ВСЕ задачи этого этапа
   - Обновить порядок в `stageConfig` (массив этапов)
   - Сохранить относительный порядок задач внутри этапа

3. **Пересчет дат (высокая сложность):**
   - После перемещения этапа нужно пересчитать даты ВСЕХ задач
   - Учесть связи между задачами (О_Н, Н_Н, О_О)
   - Учесть рабочие дни и выходные
   - Вызвать `recalculateFollowingTasks()` для всех затронутых задач

4. **Обновление интерфейса (средняя сложность):**
   - После перемещения вызвать `renderGantt()`, `renderTable()`, `renderStageTabs()`
   - Обновить метки этапов
   - Обновить выделение этапов

**Примерная структура функции:**

```javascript
function handleStageDragDrop(draggedStageName, targetStageName) {
    // 1. Найти индексы этапов в stageConfig
    const draggedIndex = stageConfig.indexOf(draggedStageName);
    const targetIndex = stageConfig.indexOf(targetStageName);
    
    // 2. Переместить этап в stageConfig
    const [movedStage] = stageConfig.splice(draggedIndex, 1);
    stageConfig.splice(targetIndex, 0, movedStage);
    
    // 3. Переместить все задачи этапа в массиве tasks
    const stageTasks = tasks.filter(t => t.stage === draggedStageName);
    const firstTaskIndex = tasks.findIndex(t => t.stage === draggedStageName);
    const lastTaskIndex = firstTaskIndex + stageTasks.length - 1;
    
    // Удаляем задачи этапа
    const movedTasks = tasks.splice(firstTaskIndex, stageTasks.length);
    
    // Находим новую позицию для вставки
    const targetFirstTaskIndex = tasks.findIndex(t => t.stage === targetStageName);
    const insertIndex = targetFirstTaskIndex >= 0 ? targetFirstTaskIndex : tasks.length;
    
    // Вставляем задачи на новое место
    tasks.splice(insertIndex, 0, ...movedTasks);
    
    // 4. Пересчитать даты всех задач
    recalculateAllTasks();
    
    // 5. Обновить интерфейс
    renderGantt();
    renderTable();
    renderStageTabs();
    updateStickyColumns();
}
```

**Оценка времени:** 4-8 часов работы для опытного разработчика.

**Рекомендация:** Если drag & drop для этапов не критичен, можно отложить эту задачу. Текущий функционал (выделение, переименование, удаление, добавление этапов) уже работает хорошо.




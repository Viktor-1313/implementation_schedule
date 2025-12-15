# Инструкция: Добавление функциональности для вертикальных этапов

## Цель
Добавить возможность:
1. Один клик - выделение этапа
2. Двойной клик - переименование этапа
3. Delete - удаление этапа с подтверждением
4. Insert - вставка нового этапа после выделенного

## Шаг 1: Добавить глобальную переменную для выделенного этапа

**Место:** После объявления других глобальных переменных (около строки 7286, где объявлены `pendingStageToDelete` и `pendingStageToRename`)

**Код для добавления:**
```javascript
let selectedStage = null; // Выделенный этап (полное название, например "Этап 1. Формирование...")
```

## Шаг 2: Добавить CSS стиль для выделенного этапа

**Место:** В секции CSS для `.gantt-stage-label` (после строки 2811, где заканчивается `.gantt-stage-label:hover`)

**Код для добавления:**
```css
/* Выделенный этап */
.gantt-stage-label.selected {
    background: rgba(30, 136, 229, 0.4);
    border-right: 3px solid var(--color-primary);
    font-weight: 700;
}

[data-theme="dark"] .gantt-stage-label.selected {
    background: rgba(66, 165, 245, 0.4);
    border-right-color: var(--color-primary);
}
```

## Шаг 3: Изменить обработчик клика на метке этапа

**Место:** Строка 12535-12538, где находится обработчик клика для `stageLabel`

**Заменить:**
```javascript
// Добавляем обработчик клика для сворачивания/разворачивания
stageLabel.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleStageCollapse(stageName);
});
```

**На:**
```javascript
// Обработчик одинарного клика - выделение этапа
let clickTimer = null;
stageLabel.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Отменяем предыдущий таймер, если он есть
    if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
    }
    
    // Устанавливаем таймер для одинарного клика
    clickTimer = setTimeout(() => {
        // Одинарный клик - выделение этапа
        selectStage(stageName);
        clickTimer = null;
    }, 200); // Задержка для различения одинарного и двойного клика
});

// Обработчик двойного клика - переименование этапа
stageLabel.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    
    // Отменяем таймер одинарного клика
    if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
    }
    
    // Двойной клик - переименование
    const stageMatch = stageName.match(/^(Этап\s+\d+)/);
    const shortName = stageMatch ? stageMatch[1] : stageName;
    openRenameStageModal(shortName);
});
```

## Шаг 4: Добавить функцию выделения этапа

**Место:** После функции `selectTask` (около строки 7890, после функции `selectTask`)

**Код для добавления:**
```javascript
// Выделение этапа
function selectStage(stageName) {
    // Снимаем выделение со всех задач
    selectedTaskIds.clear();
    
    // Убираем выделение со всех меток этапов
    document.querySelectorAll('.gantt-stage-label').forEach(label => {
        label.classList.remove('selected');
    });
    
    // Выделяем выбранный этап
    selectedStage = stageName;
    const stageLabel = document.querySelector(`.gantt-stage-label[data-stage-name="${stageName}"]`);
    if (stageLabel) {
        stageLabel.classList.add('selected');
    }
    
    // Выделяем все задачи этого этапа
    tasks.forEach((task, index) => {
        if (task.stage === stageName) {
            selectedTaskIds.add(task.id);
        }
    });
    
    // Обновляем отображение таблицы
    renderTable();
}
```

## Шаг 5: Обновить обработчик Delete для этапов

**Место:** Строка 19381-19408, где уже есть проверка `if (selectedStage)`

**Текущий код уже правильный, но нужно убедиться, что он выглядит так:**
```javascript
// Если выделен этап, открываем модальное окно удаления этапа
if (selectedStage) {
    // Находим правильное короткое название из stageConfig
    let shortName = null;
    const stageMatch = selectedStage.match(/^(Этап\s+\d+)/);
    if (stageMatch) {
        const prefix = stageMatch[1];
        shortName = stageConfig.find(stage => {
            if (stage === prefix) return true;
            return tasks.some(task => task.stage && task.stage.startsWith(prefix) && 
                task.stage.startsWith(stage + '.') || task.stage === stage);
        });
        if (!shortName) {
            shortName = prefix;
        }
    } else {
        shortName = stageConfig.find(stage => {
            return tasks.some(task => task.stage === selectedStage && task.stage.startsWith(stage));
        });
        if (!shortName) {
            shortName = selectedStage;
        }
    }
    if (shortName) {
        openStageDeleteModal(shortName);
    }
    return;
}
```

## Шаг 6: Добавить обработчик Insert для вставки этапа

**Место:** Строка 19345-19363, где обрабатывается Insert для задач

**Заменить:**
```javascript
// Вставка новой задачи под выделенной по клавише Insert
if (event.key === 'Insert') {
    if (!canEdit()) {
        return; // Блокируем Insert в режиме просмотра
    }
    const target = event.target;
    // Не перехватываем нажатие, если фокус в инпуте/селекте/редактируемом элементе
    if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
    ) {
        return;
    }
    event.preventDefault();
    insertTaskBelowSelected();
    return;
}
```

**На:**
```javascript
// Вставка новой задачи или этапа по клавише Insert
if (event.key === 'Insert') {
    if (!canEdit()) {
        return; // Блокируем Insert в режиме просмотра
    }
    const target = event.target;
    // Не перехватываем нажатие, если фокус в инпуте/селекте/редактируемом элементе
    if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
    ) {
        return;
    }
    event.preventDefault();
    
    // Если выделен этап, вставляем новый этап после него
    if (selectedStage) {
        insertStageAfterSelected();
        return;
    }
    
    // Иначе вставляем задачу
    insertTaskBelowSelected();
    return;
}
```

## Шаг 7: Добавить функцию вставки этапа после выделенного

**Место:** После функции `addNewStage` (около строки 21499, после функции `addNewStage`)

**Код для добавления:**
```javascript
// Вставка нового этапа после выделенного
async function insertStageAfterSelected() {
    if (!canEdit()) {
        return; // Блокируем добавление этапа в режиме просмотра
    }
    
    if (!selectedStage) {
        return; // Нет выделенного этапа
    }
    
    // Находим индекс выделенного этапа в stageConfig
    const stageMatch = selectedStage.match(/^(Этап\s+\d+)/);
    if (!stageMatch) {
        return; // Не удалось определить номер этапа
    }
    
    const prefix = stageMatch[1];
    const currentStageIndex = stageConfig.findIndex(stage => stage === prefix);
    
    if (currentStageIndex === -1) {
        return; // Этап не найден в конфигурации
    }
    
    // Находим максимальный номер этапа
    let maxNumber = 0;
    stageConfig.forEach(name => {
        const match = name.match(/^Этап\s+(\d+)/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNumber) maxNumber = num;
        }
    });
    
    // Создаем новый этап
    const newNumber = maxNumber + 1;
    const newShortName = `Этап ${newNumber}`;
    
    // Вставляем новый этап после текущего
    stageConfig.splice(currentStageIndex + 1, 0, newShortName);
    
    // Добавляем одну пустую задачу для нового этапа
    projectData.push({
        stage: `${newShortName}. Новый этап`,
        control: '',
        task: '',
        days: 1,
        substage: ''
    });
    
    // Устанавливаем фильтр на новый этап
    currentStageFilter = newShortName;
    
    // Инициализируем задачи и перерисовываем
    await initializeTasks();
    renderStageTabs();
    buildStageSettingsList();
    
    // Выделяем новый этап
    const newStageName = `${newShortName}. Новый этап`;
    selectStage(newStageName);
    
    // Сохраняем изменения
    autoSaveGanttState();
}
```

## Шаг 8: Обновить функцию deleteStage для сброса выделения

**Место:** Функция `deleteStage` (около строки 21455)

**Найти функцию:**
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

**Заменить на:**
```javascript
async function deleteStage(shortName) {
    stageConfig = stageConfig.filter(name => name !== shortName);
    projectData = projectData.filter(item => !item.stage || !item.stage.startsWith(shortName));

    if (currentStageFilter === shortName) {
        currentStageFilter = 'all';
    }
    
    // Сбрасываем выделение этапа, если удаляемый этап был выделен
    if (selectedStage && selectedStage.startsWith(shortName)) {
        selectedStage = null;
        document.querySelectorAll('.gantt-stage-label').forEach(label => {
            label.classList.remove('selected');
        });
        selectedTaskIds.clear();
    }

    await initializeTasks();
    renderStageTabs();
    buildStageSettingsList();
}
```

## Шаг 9: Обновить функцию renameStage для сохранения выделения

**Место:** Функция `renameStage` (около строки 21501)

**Найти функцию:**
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

**Заменить на:**
```javascript
async function renameStage(oldShortName, newShortName) {
    stageConfig = stageConfig.map(name => name === oldShortName ? newShortName : name);

    // Сохраняем информацию о выделенном этапе
    let wasSelected = false;
    let newSelectedStageName = null;
    
    if (selectedStage && selectedStage.startsWith(oldShortName)) {
        wasSelected = true;
        newSelectedStageName = newShortName + selectedStage.slice(oldShortName.length);
    }

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
    
    // Восстанавливаем выделение этапа после переименования
    if (wasSelected && newSelectedStageName) {
        selectStage(newSelectedStageName);
    }
}
```

## Шаг 10: Обновить функцию selectTask для сброса выделения этапа

**Место:** Функция `selectTask` (около строки 7846)

**Найти начало функции и добавить в начало:**
```javascript
function selectTask(taskId, options = {}) {
    // Сбрасываем выделение этапа при выделении задачи
    if (selectedStage) {
        selectedStage = null;
        document.querySelectorAll('.gantt-stage-label').forEach(label => {
            label.classList.remove('selected');
        });
    }
    
    // ... остальной код функции остается без изменений
```

## Важные замечания

1. **Не трогать строку в Ганте** - оставить тоглы фиксации и назначение выходного дня без изменений
2. **Логика переименования** - использует существующую функцию `openRenameStageModal` и `renameStage`
3. **Логика удаления** - использует существующую функцию `openStageDeleteModal` и `deleteStage`
4. **Логика вставки** - копирует логику из `addNewStage`, но вставляет после выделенного этапа
5. **Выделение задач** - при выделении этапа автоматически выделяются все его задачи

## Проверка работы

После внесения изменений проверьте:
1. ✅ Один клик по метке этапа выделяет этап (подсветка)
2. ✅ Двойной клик открывает модальное окно переименования
3. ✅ Delete при выделенном этапе открывает модальное окно удаления
4. ✅ Insert при выделенном этапе вставляет новый этап после него
5. ✅ При выделении задачи выделение этапа сбрасывается
6. ✅ При переименовании/удалении этапа выделение корректно обновляется

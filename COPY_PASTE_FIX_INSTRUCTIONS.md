# Инструкция по исправлению копирования/вставки задач

## Проблема
Текущая реализация копирования/вставки работает только с одной задачей. Нужно добавить поддержку множественного копирования/вставки: при выделении нескольких задач (Ctrl+клик) и нажатии Ctrl+C все выделенные задачи должны копироваться, а при Ctrl+V - вставляться после последней выделенной задачи.

## Изменения

### 1. Замена переменной (около строки 7277)

**Найти:**
```javascript
let copiedTask = null; // скопированная задача для вставки
```

**Заменить на:**
```javascript
let copiedTasks = []; // массив скопированных задач для вставки
```

### 2. Замена функции copyTask (около строки 14431)

**Найти функцию:**
```javascript
function copyTask(taskId) {
    const index = tasks.findIndex(t => t.id === taskId);
    if (index === -1) return;
    
    const task = tasks[index];
    // Создаем глубокую копию задачи
    copiedTask = {
        stage: task.stage,
        control: task.control,
        task: task.task,
        days: task.days,
        substage: task.substage || '',
        status: task.status || 'pending',
        dateStatuses: task.dateStatuses ? { ...task.dateStatuses } : {},
        dateComments: task.dateComments ? { ...task.dateComments } : {},
        link: task.link || '',
        responsible: task.responsible || '',
        onTravel: task.onTravel || false
    };
    
    console.log('✅ Задача скопирована:', copiedTask);
}
```

**Заменить на:**
```javascript
function copyTask(taskIds) {
    // Поддержка как одного ID, так и массива ID для обратной совместимости
    const idsToCopy = Array.isArray(taskIds) ? taskIds : [taskIds];
    
    copiedTasks = [];
    
    // Копируем все выделенные задачи в порядке их следования в массиве tasks
    const sortedTaskIds = tasks
        .filter(t => idsToCopy.includes(t.id))
        .map(t => t.id);
    
    sortedTaskIds.forEach(taskId => {
        const index = tasks.findIndex(t => t.id === taskId);
        if (index === -1) return;
        
        const task = tasks[index];
        // Создаем глубокую копию задачи
        const copiedTask = {
            stage: task.stage,
            control: task.control,
            task: task.task,
            days: task.days,
            substage: task.substage || '',
            status: task.status || 'pending',
            dateStatuses: task.dateStatuses ? { ...task.dateStatuses } : {},
            dateComments: task.dateComments ? { ...task.dateComments } : {},
            link: task.link || '',
            responsible: task.responsible || '',
            onTravel: task.onTravel || false
        };
        
        copiedTasks.push(copiedTask);
    });
    
    console.log(`✅ Скопировано задач: ${copiedTasks.length}`, copiedTasks);
}
```

### 3. Обновление функции pasteTask (около строки 14455)

**Найти проверку:**
```javascript
if (copiedTask === null) return;
```

**Заменить на:**
```javascript
if (copiedTasks.length === 0) return;
```

**Найти блок создания новой задачи (внутри функции pasteTask):**
```javascript
const newDates = getTaskDates(newStart, copiedTask.days);

const newTask = {
    id: nextTaskId++,
    stage: copiedTask.stage,
    control: copiedTask.control,
    task: copiedTask.task,
    days: copiedTask.days,
    substage: copiedTask.substage,
    startDate: newDates[0],
    endDate: newDates[newDates.length - 1],
    dates: newDates,
    status: copiedTask.status,
    dateStatuses: {},
    dateComments: {},
    link: copiedTask.link,
    responsible: copiedTask.responsible,
    onTravel: copiedTask.onTravel || false
};

// Вставляем новую задачу после выбранной
tasks.splice(insertIndex, 0, newTask);

// Пересчитываем все последующие задачи
recalculateFollowingTasks(insertIndex);
```

**Заменить на:**
```javascript
// Вставляем все скопированные задачи последовательно
const insertedTasks = [];
copiedTasks.forEach((copiedTask, idx) => {
    const newDates = getTaskDates(currentStartDate, copiedTask.days);
    
    const newTask = {
        id: nextTaskId++,
        stage: copiedTask.stage,
        control: copiedTask.control,
        task: copiedTask.task,
        days: copiedTask.days,
        substage: copiedTask.substage,
        startDate: newDates[0],
        endDate: newDates[newDates.length - 1],
        dates: newDates,
        status: copiedTask.status,
        dateStatuses: {},
        dateComments: {},
        link: copiedTask.link,
        responsible: copiedTask.responsible,
        onTravel: copiedTask.onTravel || false
    };
    
    tasks.splice(insertIndex + idx, 0, newTask);
    insertedTasks.push(newTask.id);
    
    // Следующая задача начинается после окончания текущей
    currentStartDate = new Date(newTask.endDate);
    do {
        currentStartDate.setDate(currentStartDate.getDate() + 1);
    } while (!isWorkday(currentStartDate));
});

// Пересчитываем все последующие задачи после вставленных
if (insertedTasks.length > 0) {
    const firstInsertedIndex = tasks.findIndex(t => t.id === insertedTasks[0]);
    recalculateFollowingTasks(firstInsertedIndex + insertedTasks.length - 1);
}
```

**Также нужно обновить переменную newStart на currentStartDate в начале функции pasteTask (после определения insertIndex).**

**И в конце функции pasteTask найти блок выделения задачи и заменить на:**
```javascript
// Выделяем вставленные задачи
selectedTaskIds.clear();
insertedTasks.forEach(taskId => {
    selectedTaskIds.add(taskId);
});
lastSelectedTaskId = insertedTasks[insertedTasks.length - 1];
highlightSelectedTasks();
```

### 4. Обновление обработчика Ctrl+C (около строки 25204)

**Найти:**
```javascript
const primaryTaskId = getPrimarySelectedTaskId();
if (primaryTaskId !== null) {
    event.preventDefault();
    copyTask(primaryTaskId);
}
```

**Заменить на:**
```javascript
// Копируем все выделенные задачи, если они есть, иначе копируем основную
if (selectedTaskIds.size > 0) {
    event.preventDefault();
    copyTask(Array.from(selectedTaskIds));
} else {
    const primaryTaskId = getPrimarySelectedTaskId();
    if (primaryTaskId !== null) {
        event.preventDefault();
        copyTask([primaryTaskId]);
    }
}
```

### 5. Обновление обработчика Ctrl+V (около строки 25227)

**Найти:**
```javascript
if (copiedTask !== null) {
    event.preventDefault();
    pasteTask();
}
```

**Заменить на:**
```javascript
if (copiedTasks.length > 0) {
    event.preventDefault();
    pasteTask();
}
```

## Проверка работы

После внесения изменений:
1. Выделите несколько задач (Ctrl+клик по задачам)
2. Нажмите Ctrl+C
3. Выделите одну задачу (после которой нужно вставить)
4. Нажмите Ctrl+V
5. Все скопированные задачи должны вставиться после выделенной задачи

// Функции для сохранения относительных смещений между задачами

// Вычисляет относительное смещение задачи от предшественника в рабочих днях
function calculateOffsetFromPredecessor(taskIndex) {
    if (taskIndex === 0) {
        // Первая задача не имеет предшественника, смещение = 0
        return 0;
    }
    
    const task = tasks[taskIndex];
    const prevTask = tasks[taskIndex - 1];
    
    if (!task || !prevTask || !task.startDate || !prevTask.endDate) {
        return 0;
    }
    
    // Вычисляем количество рабочих дней между окончанием предшественника и началом текущей задачи
    const dates = getWorkdaysBetween(prevTask.endDate, task.startDate);
    // Если задача начинается до окончания предшественника, смещение отрицательное
    if (task.startDate < prevTask.endDate) {
        // Считаем рабочие дни назад
        const datesBack = getWorkdaysBetween(task.startDate, prevTask.endDate);
        return -datesBack.length;
    }
    
    return dates.length;
}

// Сохраняет относительные смещения для всех задач
function saveTaskOffsets() {
    tasks.forEach((task, index) => {
        if (index === 0) {
            // Первая задача всегда имеет смещение 0
            task.offset = 0;
        } else {
            // Вычисляем смещение от предшественника
            task.offset = calculateOffsetFromPredecessor(index);
        }
    });
    console.log('💾 Сохранены смещения задач:', tasks.map((t, i) => `Задача ${i}: offset=${t.offset}`));
}

// Добавляет указанное количество рабочих дней к дате
function addWorkdays(startDate, workdays) {
    if (workdays === 0) return new Date(startDate);
    
    let currentDate = new Date(startDate);
    let added = 0;
    const direction = workdays > 0 ? 1 : -1;
    const targetDays = Math.abs(workdays);
    
    while (added < targetDays) {
        currentDate.setDate(currentDate.getDate() + direction);
        if (isWorkday(currentDate)) {
            added++;
        }
    }
    
    return currentDate;
}

// Сдвигает все задачи на указанное количество рабочих дней, сохраняя относительные смещения
function shiftAllTasksByWorkdays(workdaysDiff) {
    if (tasks.length === 0) return;
    
    // Сдвигаем первую задачу
    const firstTask = tasks[0];
    if (firstTask.startDate) {
        const newStartDate = addWorkdays(firstTask.startDate, workdaysDiff);
        firstTask.startDate = newStartDate;
        // Пересчитываем даты первой задачи
        recalculateTaskDatesWithWeekends(firstTask);
    }
    
    // Сдвигаем остальные задачи, сохраняя их относительные смещения
    for (let i = 1; i < tasks.length; i++) {
        const task = tasks[i];
        const prevTask = tasks[i - 1];
        
        // Восстанавливаем смещение, если оно было сохранено
        const offset = task.offset !== undefined ? task.offset : calculateOffsetFromPredecessor(i);
        
        if (prevTask.endDate) {
            // Вычисляем новую дату начала на основе окончания предшественника и смещения
            let newStartDate;
            if (offset === 0) {
                // Задача начинается сразу после предшественника
                newStartDate = new Date(prevTask.endDate);
                newStartDate.setDate(newStartDate.getDate() + 1);
                while (!isWorkday(newStartDate)) {
                    newStartDate.setDate(newStartDate.getDate() + 1);
                }
            } else if (offset > 0) {
                // Задача начинается через N рабочих дней после окончания предшественника
                newStartDate = new Date(prevTask.endDate);
                newStartDate.setDate(newStartDate.getDate() + 1);
                while (!isWorkday(newStartDate)) {
                    newStartDate.setDate(newStartDate.getDate() + 1);
                }
                // Добавляем offset рабочих дней
                const workdays = getWorkdaysBetween(newStartDate, addWorkdays(newStartDate, offset));
                if (workdays.length > 0 && workdays.length >= offset) {
                    newStartDate = workdays[offset - 1] || newStartDate;
                }
            } else {
                // Задача начинается за N рабочих дней ДО окончания предшественника (отрицательное смещение)
                const datesBack = getWorkdaysBackward(prevTask.endDate, Math.abs(offset));
                if (datesBack && datesBack.length > 0) {
                    newStartDate = datesBack[Math.abs(offset) - 1] || datesBack[0];
                } else {
                    newStartDate = new Date(prevTask.endDate);
                }
            }
            
            task.startDate = newStartDate;
            recalculateTaskDatesWithWeekends(task);
        }
    }
}




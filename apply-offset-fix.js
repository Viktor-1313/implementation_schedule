// Скрипт для применения исправления сохранения относительных смещений между задачами
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'implementation_schedule.html');

console.log('Чтение файла...');
let content = fs.readFileSync(filePath, 'utf8');

// Новые функции для добавления перед updateStartDate
const newFunctions = `
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
            console.log('💾 Сохранены смещения задач:', tasks.map((t, i) => \`Задача \${i}: offset=\${t.offset}\`));
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

`;

// Новая версия функции updateStartDate
const newUpdateStartDate = `        async function updateStartDate() {
            const input = document.getElementById('startDateInput');
            const newDate = parseDateFromInput(input.value);
            
            if (!isWorkday(newDate)) {
                alert('Пожалуйста, выберите рабочий день');
                return;
            }
            
            // Сохраняем текущие смещения перед изменением
            saveTaskOffsets();
            
            // Вычисляем разницу в рабочих днях между старой и новой датой старта
            const oldStartDate = tasks.length > 0 && tasks[0].startDate ? new Date(tasks[0].startDate) : startDate;
            let workdaysDiff = 0;
            
            if (newDate > oldStartDate) {
                const dates = getWorkdaysBetween(oldStartDate, newDate);
                workdaysDiff = dates.length;
            } else if (newDate < oldStartDate) {
                const datesBack = getWorkdaysBetween(newDate, oldStartDate);
                workdaysDiff = -datesBack.length;
            }
            
            // Сдвигаем все задачи, сохраняя относительные смещения
            shiftAllTasksByWorkdays(workdaysDiff);
            
            // Обновляем глобальную дату старта
            startDate = newDate;
            
            // Перерисовываем график и таблицу
            renderGantt();
            renderTable();
            updateStatistics();
            
            // Сохраняем изменения
            debouncedSave();
            
            closeModal();
        }`;

// Проверяем, не добавлены ли уже функции
if (content.includes('function calculateOffsetFromPredecessor')) {
    console.log('⚠️ Функции уже добавлены, пропускаем добавление новых функций');
} else {
    // Добавляем новые функции перед updateStartDate
    const updateStartDateRegex = /(\s+)(async function updateStartDate\(\))/;
    if (updateStartDateRegex.test(content)) {
        content = content.replace(updateStartDateRegex, newFunctions + '$1$2');
        console.log('✅ Добавлены новые функции');
    } else {
        console.log('❌ Не найдена функция updateStartDate для добавления новых функций');
    }
}

// Заменяем функцию updateStartDate
const oldUpdateStartDateRegex = /async function updateStartDate\(\)\s*\{[^}]*const input = document\.getElementById\('startDateInput'\);[^}]*const newDate = parseDateFromInput\(input\.value\);[^}]*if \(isWorkday\(newDate\)\) \{[^}]*startDate = newDate;[^}]*await initializeTasks\(\);[^}]*closeModal\(\);[^}]*\} else \{[^}]*alert\('Пожалуйста, выберите рабочий день'\);[^}]*\}[^}]*\}/s;

if (oldUpdateStartDateRegex.test(content)) {
    content = content.replace(oldUpdateStartDateRegex, newUpdateStartDate);
    console.log('✅ Обновлена функция updateStartDate');
} else {
    // Пробуем более простой паттерн
    const simplePattern = /async function updateStartDate\(\)\s*\{[\s\S]*?await initializeTasks\(\);[\s\S]*?\}/;
    if (simplePattern.test(content)) {
        content = content.replace(simplePattern, newUpdateStartDate);
        console.log('✅ Обновлена функция updateStartDate (простой паттерн)');
    } else {
        console.log('⚠️ Не удалось найти функцию updateStartDate для замены');
        console.log('Попробуйте применить изменения вручную согласно инструкции в OFFSET_FIX_INSTRUCTIONS.md');
    }
}

// Сохраняем файл
console.log('Сохранение файла...');
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Изменения применены!');





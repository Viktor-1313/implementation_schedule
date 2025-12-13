// Скрипт для исправления recalculateFollowingTasks - использование сохраненных смещений
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'implementation_schedule.html');

console.log('Чтение файла...');
let content = fs.readFileSync(filePath, 'utf8');

// Новая версия recalculateFollowingTasks с учетом смещений
const newRecalculateFollowingTasks = `        function recalculateFollowingTasks(changedIndex) {
            console.log('🔢 recalculateFollowingTasks: Начало пересчета с индекса', changedIndex);
            
            // ВАЖНО: Сохраняем смещения ПЕРЕД пересчетом, чтобы не потерять настройки
            if (typeof saveTaskOffsets === 'function') {
                saveTaskOffsets();
            }
            
            for (let i = changedIndex + 1; i < tasks.length; i++) {
                const prevTask = tasks[i - 1];
                const task = tasks[i];
                
                // Нормализуем даты предыдущей задачи (преобразуем строки в Date)
                if (prevTask.startDate && !(prevTask.startDate instanceof Date)) {
                    prevTask.startDate = new Date(prevTask.startDate);
                }
                if (prevTask.endDate && !(prevTask.endDate instanceof Date)) {
                    prevTask.endDate = new Date(prevTask.endDate);
                }
                
                // Нормализуем даты текущей задачи
                if (task.startDate && !(task.startDate instanceof Date)) {
                    task.startDate = new Date(task.startDate);
                }
                if (task.endDate && !(task.endDate instanceof Date)) {
                    task.endDate = new Date(task.endDate);
                }
                
                // Нормализуем массив дат задачи
                if (task.dates && Array.isArray(task.dates)) {
                    task.dates = task.dates.map(d => d instanceof Date ? d : new Date(d)).filter(d => !isNaN(d.getTime()));
                }
                
                // Убеждаемся, что task.days определено (используем текущее количество дат или 1 по умолчанию)
                if (!task.days || task.days <= 0) {
                    task.days = task.dates && task.dates.length > 0 ? task.dates.length : 1;
                    console.log(\`   ⚠️ task.days для задачи \${i} было не определено, установлено:\`, task.days);
                }
                
                // Устанавливаем дефолтное значение О_Н, если связи нет
                if (!task.link) {
                    task.link = 'О_Н';
                }
                
                // Определяем тип связи (по умолчанию О_Н)
                const linkType = task.link || 'О_Н';
                
                // ВАЖНО: Используем сохраненное смещение, если оно есть
                const offset = task.offset !== undefined ? task.offset : (i === 0 ? 0 : calculateOffsetFromPredecessor(i));
                
                let newStart, newEnd;
                let shouldRecalculate = false;

                if (linkType === 'Н_Н') {
                    // Н_Н: начало-начало - задача начинается в ту же дату, что и предшественник
                    if (!prevTask.startDate) continue;
                    newStart = new Date(prevTask.startDate);
                    const taskStartTime = safeGetTime(task.startDate);
                    shouldRecalculate = isNaN(taskStartTime) || taskStartTime !== newStart.getTime();
                    
                    if (shouldRecalculate) {
                        task.startDate = newStart;
                        // Пересчитываем даты с учетом количества рабочих дней
                        recalculateTaskDatesWithWeekends(task);
                    }
                } else if (linkType === 'О_О') {
                    // О_О: окончание-окончание - задача заканчивается в ту же дату, что и предшественник
                    if (!prevTask.endDate) continue;
                    newEnd = new Date(prevTask.endDate);
                    const taskEndTime = safeGetTime(task.endDate);
                    shouldRecalculate = isNaN(taskEndTime) || taskEndTime !== newEnd.getTime();
                    
                    if (shouldRecalculate) {
                        task.endDate = newEnd;
                        // Пересчитываем дату начала назад от даты окончания
                        const daysCount = task.days || 1;
                        const dates = getWorkdaysBackward(task.endDate, daysCount);
                        if (dates && dates.length > 0) {
                            task.dates = dates;
                            task.startDate = dates[0];
                            task.endDate = dates[dates.length - 1];
                        }
                    }
                } else {
                    // О_Н (по умолчанию): окончание-начало - задача начинается после окончания предыдущей
                    // НО с учетом сохраненного смещения!
                    if (!prevTask.endDate) continue;
                    
                    // Вычисляем новую дату начала на основе окончания предшественника и смещения
                    if (offset === 0) {
                        // Задача начинается сразу после предшественника
                        newStart = new Date(prevTask.endDate);
                        newStart.setDate(newStart.getDate() + 1);
                        while (!isWorkday(newStart)) {
                            newStart.setDate(newStart.getDate() + 1);
                        }
                    } else if (offset > 0) {
                        // Задача начинается через N рабочих дней после окончания предшественника
                        newStart = new Date(prevTask.endDate);
                        newStart.setDate(newStart.getDate() + 1);
                        while (!isWorkday(newStart)) {
                            newStart.setDate(newStart.getDate() + 1);
                        }
                        // Добавляем offset рабочих дней
                        const workdays = getWorkdaysBetween(newStart, addWorkdays(newStart, offset));
                        if (workdays.length > 0 && workdays.length >= offset) {
                            newStart = workdays[offset - 1] || newStart;
                        }
                    } else {
                        // Задача начинается за N рабочих дней ДО окончания предшественника (отрицательное смещение)
                        const datesBack = getWorkdaysBackward(prevTask.endDate, Math.abs(offset));
                        if (datesBack && datesBack.length > 0) {
                            newStart = datesBack[Math.abs(offset) - 1] || datesBack[0];
                        } else {
                            newStart = new Date(prevTask.endDate);
                        }
                    }
                    
                    const taskStartTime = safeGetTime(task.startDate);
                    shouldRecalculate = isNaN(taskStartTime) || taskStartTime !== newStart.getTime();
                    
                    if (shouldRecalculate) {
                        task.startDate = newStart;
                        // Пересчитываем даты с учетом количества рабочих дней (weekend-manual)
                        recalculateTaskDatesWithWeekends(task);
                    }
                }

                if (!shouldRecalculate) {
                    console.log(\`   ✅ Задача не требует пересчета для задачи \${i}, пропускаем\`);
                    continue;
                }

                console.log(\`\\n   🔄 Обновлена задача \${i}:\`, task.task || task.name || \`ID \${task.id}\`);
                console.log(\`   🔗 Тип связи: \${linkType}\`);
                console.log(\`   📅 Смещение: \${offset}\`);
                console.log('   📅 Новая дата начала:', formatDateKey(task.startDate));
                console.log('   📅 Новая дата окончания:', task.endDate ? formatDateKey(task.endDate) : 'нет');
                console.log('   📅 Все даты задачи:', task.dates?.map(d => formatDateKey(d)) || []);

                // Сохраняем смещение после пересчета
                if (typeof calculateOffsetFromPredecessor === 'function') {
                    task.offset = calculateOffsetFromPredecessor(i);
                }
            }
            
            // Сохраняем смещения после всех пересчетов
            if (typeof saveTaskOffsets === 'function') {
                saveTaskOffsets();
            }
            
            console.log('✅ recalculateFollowingTasks: Пересчет завершен\\n');
        }`;

// Заменяем функцию recalculateFollowingTasks
const oldPattern = /function recalculateFollowingTasks\(changedIndex\)\s*\{[\s\S]*?console\.log\('✅ recalculateFollowingTasks: Пересчет завершен\\n'\);/;
const simplePattern = /function recalculateFollowingTasks\(changedIndex\)\s*\{[\s\S]*?\n\s*console\.log\('🔢 recalculateFollowingTasks: Пересчет завершен\\n'\);/;

if (oldPattern.test(content)) {
    content = content.replace(oldPattern, newRecalculateFollowingTasks);
    console.log('✅ Обновлена функция recalculateFollowingTasks');
} else if (simplePattern.test(content)) {
    content = content.replace(simplePattern, newRecalculateFollowingTasks);
    console.log('✅ Обновлена функция recalculateFollowingTasks (простой паттерн)');
} else {
    // Пробуем найти функцию по началу и концу
    const startPattern = /function recalculateFollowingTasks\(changedIndex\)\s*\{/;
    const endPattern = /console\.log\('🔢 recalculateFollowingTasks: Пересчет завершен/;
    
    if (startPattern.test(content) && endPattern.test(content)) {
        // Находим начало и конец функции
        const startMatch = content.match(startPattern);
        const endMatch = content.match(endPattern);
        
        if (startMatch && endMatch) {
            const startIndex = startMatch.index;
            // Ищем закрывающую скобку после последнего console.log
            let endIndex = endMatch.index + endMatch[0].length;
            let braceCount = 1;
            let found = false;
            
            for (let i = endIndex; i < content.length && !found; i++) {
                if (content[i] === '{') braceCount++;
                if (content[i] === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        endIndex = i + 1;
                        found = true;
                    }
                }
            }
            
            if (found) {
                content = content.substring(0, startIndex) + newRecalculateFollowingTasks + content.substring(endIndex);
                console.log('✅ Обновлена функция recalculateFollowingTasks (по индексам)');
            } else {
                console.log('⚠️ Не удалось найти конец функции recalculateFollowingTasks');
            }
        }
    } else {
        console.log('⚠️ Функция recalculateFollowingTasks не найдена в ожидаемом формате');
        console.log('Попробуйте применить изменения вручную');
    }
}

// Также нужно убедиться, что смещения сохраняются ПЕРЕД вызовом recalculateFollowingTasks
// Найдем места, где вызывается recalculateFollowingTasks и добавим сохранение смещений перед вызовом

const recalculateCallPattern = /(\s+)(recalculateFollowingTasks\([^)]+\);)/g;
if (recalculateCallPattern.test(content)) {
    content = content.replace(recalculateCallPattern, (match, indent, call) => {
        // Проверяем, не добавлено ли уже сохранение смещений
        const beforeMatch = content.substring(Math.max(0, content.indexOf(match) - 200), content.indexOf(match));
        if (!beforeMatch.includes('saveTaskOffsets()') && !beforeMatch.includes('// Сохраняем смещения')) {
            return indent + '// Сохраняем смещения перед пересчетом\n' + 
                   indent + 'if (typeof saveTaskOffsets === \'function\') {\n' +
                   indent + '    saveTaskOffsets();\n' +
                   indent + '}\n' +
                   indent + call;
        }
        return match;
    });
    console.log('✅ Добавлено сохранение смещений перед вызовами recalculateFollowingTasks');
}

// Сохраняем файл
console.log('Сохранение файла...');
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Изменения применены!');

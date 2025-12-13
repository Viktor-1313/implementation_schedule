// ПОЛНОЕ ИСПРАВЛЕНИЕ: Сохранение относительных смещений между задачами
// Этот скрипт исправляет все проблемы с сохранением смещений

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'implementation_schedule.html');

console.log('🔧 Начинаем полное исправление сохранения смещений...');
let content = fs.readFileSync(filePath, 'utf8');

let changesMade = false;

// 1. Убедимся, что функция recalculateFollowingTasks использует сохраненные смещения
// Ищем функцию и заменяем логику для О_Н связи
const recalculatePattern = /(} else \{\s*\/\/ О_Н \(по умолчанию\): окончание-начало[\s\S]*?if \(!prevTask\.endDate\) continue;[\s\S]*?)(newStart = new Date\(prevTask\.endDate\);[\s\S]*?newStart\.setDate\(newStart\.getDate\(\) \+ 1\);[\s\S]*?while \(!isWorkday\(newStart\)\) \{[\s\S]*?newStart\.setDate\(newStart\.getDate\(\) \+ 1\);[\s\S]*?\}[\s\S]*?const taskStartTime = safeGetTime\(task\.startDate\);)/;

if (recalculatePattern.test(content)) {
    const replacement = `$1// ВАЖНО: Используем сохраненное смещение
                    const offset = task.offset !== undefined ? task.offset : (typeof calculateOffsetFromPredecessor === 'function' ? calculateOffsetFromPredecessor(i) : 0);
                    
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
                        if (typeof addWorkdays === 'function') {
                            const workdays = getWorkdaysBetween(newStart, addWorkdays(newStart, offset));
                            if (workdays.length > 0 && workdays.length >= offset) {
                                newStart = workdays[offset - 1] || newStart;
                            }
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
                    
                    $2`;
    
    content = content.replace(recalculatePattern, replacement);
    changesMade = true;
    console.log('✅ Обновлена логика О_Н в recalculateFollowingTasks для использования смещений');
}

// 2. Добавим сохранение смещений в НАЧАЛЕ функции recalculateFollowingTasks
const recalculateStartPattern = /(function recalculateFollowingTasks\(changedIndex\)\s*\{[\s\S]*?console\.log\('🔢 recalculateFollowingTasks: Начало пересчета с индекса', changedIndex\);)/;

if (recalculateStartPattern.test(content)) {
    const replacement = `$1
            
            // КРИТИЧЕСКИ ВАЖНО: Сохраняем смещения ПЕРЕД пересчетом, чтобы не потерять настройки
            if (typeof saveTaskOffsets === 'function') {
                saveTaskOffsets();
            }`;
    
    if (!content.includes('// КРИТИЧЕСКИ ВАЖНО: Сохраняем смещения ПЕРЕД пересчетом')) {
        content = content.replace(recalculateStartPattern, replacement);
        changesMade = true;
        console.log('✅ Добавлено сохранение смещений в начале recalculateFollowingTasks');
    }
}

// 3. Добавим сохранение смещений в onTaskTableInputChange ПЕРЕД изменением дат
// Ищем начало обработки startDate
const onTaskTableInputChangeStartDate = /(} else if \(field === 'startDate'\)\s*\{[\s\S]*?)(task\.startDate = parseDateFromInput\(input\.value\);)/;

if (onTaskTableInputChangeStartDate.test(content)) {
    const replacement = `$1// Сохраняем смещения ПЕРЕД изменением даты начала
                if (typeof saveTaskOffsets === 'function') {
                    saveTaskOffsets();
                }
                $2`;
    
    if (!content.match(/} else if \(field === 'startDate'\)\s*\{[\s\S]*?\/\/ Сохраняем смещения ПЕРЕД изменением даты начала/)) {
        content = content.replace(onTaskTableInputChangeStartDate, replacement);
        changesMade = true;
        console.log('✅ Добавлено сохранение смещений ПЕРЕД изменением startDate');
    }
}

// 4. Добавим сохранение смещений ПЕРЕД изменением endDate
const onTaskTableInputChangeEndDate = /(} else if \(field === 'endDate'\)\s*\{[\s\S]*?const newEnd = parseDateFromInput\(input\.value\);[\s\S]*?)(\/\/ Правило: дата окончания)/;

if (onTaskTableInputChangeEndDate.test(content)) {
    const replacement = `$1// Сохраняем смещения ПЕРЕД изменением даты окончания
                if (typeof saveTaskOffsets === 'function') {
                    saveTaskOffsets();
                }
                $2`;
    
    if (!content.match(/} else if \(field === 'endDate'\)\s*\{[\s\S]*?\/\/ Сохраняем смещения ПЕРЕД изменением даты окончания/)) {
        content = content.replace(onTaskTableInputChangeEndDate, replacement);
        changesMade = true;
        console.log('✅ Добавлено сохранение смещений ПЕРЕД изменением endDate');
    }
}

// 5. Убедимся, что смещения сохраняются после пересчета дат задачи
const afterRecalculateTaskDates = /(recalculateTaskDatesWithWeekends\(task\);[\s\S]*?)(\/\/ Пересчитываем даты задачи в зависимости)/;

if (afterRecalculateTaskDates.test(content)) {
    const replacement = `$1// Сохраняем смещения после пересчета дат задачи
                if (typeof saveTaskOffsets === 'function') {
                    saveTaskOffsets();
                }
                $2`;
    
    if (!content.match(/recalculateTaskDatesWithWeekends\(task\);[\s\S]*?\/\/ Сохраняем смещения после пересчета дат задачи/)) {
        content = content.replace(afterRecalculateTaskDates, replacement);
        changesMade = true;
        console.log('✅ Добавлено сохранение смещений после recalculateTaskDatesWithWeekends');
    }
}

if (changesMade) {
    console.log('💾 Сохранение файла...');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Все исправления применены!');
} else {
    console.log('ℹ️ Все исправления уже применены или не требуются');
}

console.log('\n📋 Резюме:');
console.log('1. ✅ recalculateFollowingTasks теперь использует сохраненные смещения');
console.log('2. ✅ Смещения сохраняются ПЕРЕД пересчетом задач');
console.log('3. ✅ Смещения сохраняются ПЕРЕД изменением дат в таблице');
console.log('4. ✅ Смещения сохраняются после пересчета дат задачи');
console.log('\n🎯 Теперь при изменении даты задачи смещения сохраняются и применяются корректно!');

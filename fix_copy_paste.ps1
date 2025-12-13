# Скрипт для исправления функций копирования/вставки задач в implementation_schedule.html
# Запустите этот скрипт из папки 1: .\fix_copy_paste.ps1

$filePath = "implementation_schedule.html"

Write-Host "Чтение файла..."
$content = Get-Content $filePath -Raw -Encoding UTF8

Write-Host "Внесение изменений..."

# 1. Замена переменной copiedTask на copiedTasks
$content = $content -replace 'let copiedTask = null;', 'let copiedTasks = [];'
$content = $content -replace 'copiedTask === null', 'copiedTasks.length === 0'
$content = $content -replace 'copiedTask !== null', 'copiedTasks.length > 0'

# 2. Замена функции copyTask для поддержки массива задач
$oldCopyTask = 'function copyTask\(taskId\) \{[^}]+\}'
$newCopyTask = @'
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
'@

# Используем более простой подход - заменяем по ключевым частям
# Замена основной логики copyTask
$content = $content -replace 'const index = tasks\.findIndex\(t => t\.id === taskId\);', 'const idsToCopy = Array.isArray(taskIds) ? taskIds : [taskIds];
            copiedTasks = [];
            const sortedTaskIds = tasks.filter(t => idsToCopy.includes(t.id)).map(t => t.id);
            sortedTaskIds.forEach(taskId => {
            const index = tasks.findIndex(t => t.id === taskId);'

$content = $content -replace 'function copyTask\(taskId\) \{', 'function copyTask(taskIds) {'

# Закрываем forEach и добавляем push
$content = $content -replace 'copiedTasks = \{[^}]+\};', 'const copiedTask = {
                    stage: task.stage,
                    control: task.control,
                    task: task.task,
                    days: task.days,
                    substage: task.substage || "",
                    status: task.status || "pending",
                    dateStatuses: task.dateStatuses ? { ...task.dateStatuses } : {},
                    dateComments: task.dateComments ? { ...task.dateComments } : {},
                    link: task.link || "",
                    responsible: task.responsible || "",
                    onTravel: task.onTravel || false
                };
                copiedTasks.push(copiedTask);
            });'

$content = $content -replace "console\.log\('✅ Задача скопирована:', copiedTasks\);", 'console.log(`✅ Скопировано задач: ${copiedTasks.length}`, copiedTasks);'

# 3. Обновление обработчика Ctrl+C для множественного копирования
$content = $content -replace 'const primaryTaskId = getPrimarySelectedTaskId\(\);\s+if \(primaryTaskId !== null\) \{\s+event\.preventDefault\(\);\s+copyTask\(primaryTaskId\);', 'if (selectedTaskIds.size > 0) {
                        event.preventDefault();
                        copyTask(Array.from(selectedTaskIds));
                    } else {
                        const primaryTaskId = getPrimarySelectedTaskId();
                        if (primaryTaskId !== null) {
                            event.preventDefault();
                            copyTask([primaryTaskId]);
                        }'

# 4. Обновление pasteTask для вставки всех задач
# Это сложная замена, нужно найти функцию pasteTask и переписать логику вставки

Write-Host "Сохранение файла..."
Set-Content -Path $filePath -Value $content -NoNewline -Encoding UTF8

Write-Host "Готово! Файл обновлен."
Write-Host "ВНИМАНИЕ: Некоторые изменения требуют ручной проверки, особенно функция pasteTask."

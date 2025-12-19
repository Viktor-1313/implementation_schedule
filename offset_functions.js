        // Вычисление относительного смещения (offset) между задачами в рабочих днях
        function calculateTaskOffset(task, prevTask) {
            if (!prevTask || !task) return 0;
            const linkType = task.link || 'О_Н';
            const prevStart = prevTask.startDate instanceof Date ? prevTask.startDate : new Date(prevTask.startDate);
            const prevEnd = prevTask.endDate instanceof Date ? prevTask.endDate : new Date(prevTask.endDate);
            const taskStart = task.startDate instanceof Date ? task.startDate : new Date(task.startDate);
            if (linkType === 'Н_Н') {
                return 0;
            } else if (linkType === 'О_О') {
                const dates = getWorkdaysBetween(prevEnd, taskStart);
                return dates.length;
            } else {
                if (taskStart < prevEnd) {
                    const backwardDates = getWorkdaysBetween(taskStart, prevEnd);
                    return -backwardDates.length;
                }
                const dates = getWorkdaysBetween(prevEnd, taskStart);
                return dates.length;
            }
        }
        
        // Сохранение offset для всех задач
        function saveTaskOffsets() {
            tasks.forEach((task, index) => {
                if (index === 0) {
                    task.offset = 0;
                } else {
                    const prevTask = tasks[index - 1];
                    task.offset = calculateTaskOffset(task, prevTask);
                }
            });
        }
        




(() => {
      "use strict";

      const SIZE = 9;
      const DIGITS = 0x3FE;
      const CLUES = { easy: 40, medium: 34, hard: 29 };
      const boardElement = document.getElementById("board");
      const difficultyElement = document.getElementById("difficulty");
      const timerElement = document.getElementById("timer");
      const hintCountElement = document.getElementById("hintCount");
      const statusElement = document.getElementById("statusMessage");
      const clueCountElement = document.getElementById("clueCount");
      const pauseOverlay = document.getElementById("pauseOverlay");
      const undoButton = document.getElementById("undo");
      const hintButton = document.getElementById("hint");
      const pauseButton = document.getElementById("pause");
      const notesButton = document.getElementById("notesToggle");
      const numberButtons = [];
      const cellButtons = [];
      const today = new Date().toLocaleDateString("en-CA");
      const dailyKey = "little-sudoku-daily-v1";
      let daily = loadDaily();
      let solution = [];
      let values = [];
      let given = [];
      let notes = [];
      let selected = -1;
      let history = [];
      let paused = false;
      let won = false;
      let notesMode = false;
      let elapsedSeconds = 0;
      let hintCount = 0;
      let puzzleId = "";

      function loadDaily() {
        try {
          const saved = JSON.parse(localStorage.getItem(dailyKey) || "null");
          if (saved && saved.date === today && Array.isArray(saved.correctKeys)) return saved;
        } catch (error) {
          console.warn("Could not load daily puzzle progress.", error);
        }
        return { date: today, correctKeys: [], easyWins: 0, lowHintWins: 0 };
      }

      function saveDaily() {
        try {
          localStorage.setItem(dailyKey, JSON.stringify(daily));
        } catch (error) {
          console.warn("Could not save daily puzzle progress.", error);
        }
      }

      function shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
      }

      function makeSolvedGrid() {
        const bands = shuffle([0, 1, 2]);
        const stacks = shuffle([0, 1, 2]);
        const rows = bands.flatMap(band => shuffle([0, 1, 2]).map(row => band * 3 + row));
        const columns = stacks.flatMap(stack => shuffle([0, 1, 2]).map(column => stack * 3 + column));
        const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        return rows.map(row => columns.map(column => digits[(row * 3 + Math.floor(row / 3) + column) % SIZE]));
      }

      function boxIndex(row, column) {
        return Math.floor(row / 3) * 3 + Math.floor(column / 3);
      }

      function solutionCount(input, limit = 2) {
        const grid = input.map(row => row.slice());
        const rowMasks = Array(SIZE).fill(0);
        const columnMasks = Array(SIZE).fill(0);
        const boxMasks = Array(SIZE).fill(0);
        for (let row = 0; row < SIZE; row++) {
          for (let column = 0; column < SIZE; column++) {
            const value = grid[row][column];
            if (!value) continue;
            const bit = 1 << value;
            const box = boxIndex(row, column);
            if ((rowMasks[row] | columnMasks[column] | boxMasks[box]) & bit) return 0;
            rowMasks[row] |= bit;
            columnMasks[column] |= bit;
            boxMasks[box] |= bit;
          }
        }

        function search() {
          let bestRow = -1;
          let bestColumn = -1;
          let bestCandidates = 0;
          let bestCount = 10;
          for (let row = 0; row < SIZE; row++) {
            for (let column = 0; column < SIZE; column++) {
              if (grid[row][column]) continue;
              const mask = DIGITS & ~(rowMasks[row] | columnMasks[column] | boxMasks[boxIndex(row, column)]);
              const count = bitCount(mask);
              if (count === 0) return 0;
              if (count < bestCount) {
                bestRow = row;
                bestColumn = column;
                bestCandidates = mask;
                bestCount = count;
                if (count === 1) break;
              }
            }
            if (bestCount === 1) break;
          }
          if (bestRow === -1) return 1;
          let total = 0;
          const box = boxIndex(bestRow, bestColumn);
          for (let value = 1; value <= SIZE; value++) {
            const bit = 1 << value;
            if (!(bestCandidates & bit)) continue;
            grid[bestRow][bestColumn] = value;
            rowMasks[bestRow] |= bit;
            columnMasks[bestColumn] |= bit;
            boxMasks[box] |= bit;
            total += search();
            grid[bestRow][bestColumn] = 0;
            rowMasks[bestRow] ^= bit;
            columnMasks[bestColumn] ^= bit;
            boxMasks[box] ^= bit;
            if (total >= limit) return total;
          }
          return total;
        }

        return search();
      }

      function bitCount(mask) {
        let count = 0;
        while (mask) {
          mask &= mask - 1;
          count++;
        }
        return count;
      }

      function makePuzzle(level) {
        const solved = makeSolvedGrid();
        const puzzle = solved.map(row => row.slice());
        const cells = shuffle(Array.from({ length: 81 }, (_, index) => index));
        let clues = 81;
        const target = CLUES[level];
        for (const index of cells) {
          if (clues <= target) break;
          const row = Math.floor(index / 9);
          const column = index % 9;
          puzzle[row][column] = 0;
          if (solutionCount(puzzle) === 1) clues--;
          else puzzle[row][column] = solved[row][column];
        }
        return { solved, puzzle, clues };
      }

      function makeBoardButtons() {
        for (let index = 0; index < 81; index++) {
          const row = Math.floor(index / 9);
          const column = index % 9;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "cell";
          button.setAttribute("role", "gridcell");
          button.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}, empty`);
          if (column === 2 || column === 5) button.classList.add("box-right");
          if (row === 2 || row === 5) button.classList.add("box-bottom");
          button.innerHTML = '<span class="cell-value"></span><span class="cell-notes" aria-hidden="true"></span>';
          button.addEventListener("click", () => {
            selected = index;
            render();
          });
          boardElement.appendChild(button);
          cellButtons.push(button);
        }
        for (let value = 1; value <= 9; value++) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "number-key";
          button.textContent = String(value);
          button.setAttribute("aria-label", `Enter ${value}`);
          button.addEventListener("click", () => enterValue(value));
          document.getElementById("numberPad").appendChild(button);
          numberButtons.push(button);
        }
        const erase = document.createElement("button");
        erase.type = "button";
        erase.className = "number-key erase";
        erase.textContent = "⌫ Clear";
        erase.setAttribute("aria-label", "Clear selected cell");
        erase.addEventListener("click", clearSelected);
        document.getElementById("numberPad").appendChild(erase);
        numberButtons.push(erase);
      }

      function newGame() {
        const level = difficultyElement.value;
        const puzzle = makePuzzle(level);
        solution = puzzle.solved.flat();
        values = puzzle.puzzle.flat();
        given = values.map(value => value !== 0);
        notes = Array.from({ length: 81 }, () => new Set());
        selected = -1;
        history = [];
        paused = false;
        won = false;
        notesMode = false;
        elapsedSeconds = 0;
        hintCount = 0;
        puzzleId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        statusElement.textContent = "";
        pauseButton.innerHTML = 'Ⅱ <span>Pause</span>';
        pauseButton.setAttribute("aria-pressed", "false");
        notesButton.classList.remove("active");
        notesButton.setAttribute("aria-pressed", "false");
        pauseOverlay.classList.remove("visible");
        clueCountElement.textContent = `${puzzle.clues} clues`;
        render();
        renderTasks();
      }

      function isRelated(first, second) {
        if (first < 0 || second < 0) return false;
        const rowA = Math.floor(first / 9);
        const columnA = first % 9;
        const rowB = Math.floor(second / 9);
        const columnB = second % 9;
        return rowA === rowB || columnA === columnB || boxIndex(rowA, columnA) === boxIndex(rowB, columnB);
      }

      function findConflicts() {
        const conflicts = new Set();
        for (let index = 0; index < 81; index++) {
          const value = values[index];
          if (!value) continue;
          if (!given[index] && value !== solution[index]) conflicts.add(index);
          const row = Math.floor(index / 9);
          const column = index % 9;
          for (let otherColumn = column + 1; otherColumn < 9; otherColumn++) {
            const other = row * 9 + otherColumn;
            if (values[other] === value) { conflicts.add(index); conflicts.add(other); }
          }
          for (let otherRow = row + 1; otherRow < 9; otherRow++) {
            const other = otherRow * 9 + column;
            if (values[other] === value) { conflicts.add(index); conflicts.add(other); }
          }
          const startRow = Math.floor(row / 3) * 3;
          const startColumn = Math.floor(column / 3) * 3;
          for (let r = startRow; r < startRow + 3; r++) {
            for (let c = startColumn; c < startColumn + 3; c++) {
              const other = r * 9 + c;
              if (other > index && values[other] === value) { conflicts.add(index); conflicts.add(other); }
            }
          }
        }
        return conflicts;
      }

      function render() {
        const conflicts = findConflicts();
        const selectedValue = selected >= 0 ? values[selected] : 0;
        cellButtons.forEach((button, index) => {
          const value = values[index];
          button.classList.toggle("given", given[index]);
          button.classList.toggle("related", selected !== index && isRelated(selected, index));
          button.classList.toggle("selected", selected === index);
          button.classList.toggle("same-value", Boolean(selectedValue && value === selectedValue));
          button.classList.toggle("conflict", conflicts.has(index));
          button.disabled = paused || won;
          button.querySelector(".cell-value").textContent = value || "";
          const noteContainer = button.querySelector(".cell-notes");
          noteContainer.replaceChildren();
          if (!value && notes[index].size) {
            for (let note = 1; note <= 9; note++) {
              const span = document.createElement("span");
              span.textContent = notes[index].has(note) ? String(note) : "";
              noteContainer.appendChild(span);
            }
          }
          const position = `Row ${Math.floor(index / 9) + 1}, column ${index % 9 + 1}`;
          const description = value ? `, ${value}${given[index] ? ", given" : conflicts.has(index) ? ", incorrect or conflicting" : ""}` : notes[index].size ? `, notes ${[...notes[index]].join(", ")}` : ", empty";
          button.setAttribute("aria-label", position + description);
          button.setAttribute("aria-selected", selected === index ? "true" : "false");
        });
        numberButtons.forEach(button => { button.disabled = paused || won; });
        undoButton.disabled = paused || won || history.length === 0;
        hintButton.disabled = paused || won;
        notesButton.disabled = paused || won;
        timerElement.textContent = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
        hintCountElement.textContent = `${hintCount} ${hintCount === 1 ? "hint" : "hints"} used`;
      }

      function updateTimer() {
        timerElement.textContent = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
      }

      function saveUndo(index) {
        history.push({ index, value: values[index], notes: [...notes[index]] });
        if (history.length > 500) history.shift();
      }

      function enterValue(value) {
        if (paused || won || selected < 0 || given[selected]) return;
        if (notesMode) {
          if (values[selected]) return;
          saveUndo(selected);
          if (notes[selected].has(value)) notes[selected].delete(value);
          else notes[selected].add(value);
          render();
          return;
        }
        if (values[selected] === value) return;
        saveUndo(selected);
        const wasEmpty = values[selected] === 0;
        values[selected] = value;
        notes[selected].clear();
        if (wasEmpty && value === solution[selected]) {
          const key = `${puzzleId}:${selected}`;
          if (!daily.correctKeys.includes(key)) {
            daily.correctKeys.push(key);
            saveDaily();
          }
        }
        checkWin();
        render();
        renderTasks();
      }

      function clearSelected() {
        if (paused || won || selected < 0 || given[selected]) return;
        if (!values[selected] && notes[selected].size === 0) return;
        saveUndo(selected);
        values[selected] = 0;
        notes[selected].clear();
        statusElement.textContent = "";
        render();
      }

      function undo() {
        if (paused || won || !history.length) return;
        const previous = history.pop();
        values[previous.index] = previous.value;
        notes[previous.index] = new Set(previous.notes);
        selected = previous.index;
        statusElement.textContent = "Last move undone.";
        render();
      }

      function revealHint() {
        if (paused || won) return;
        if (selected < 0) {
          statusElement.textContent = "Choose a cell first.";
          return;
        }
        if (given[selected]) {
          statusElement.textContent = "That number was there from the start.";
          return;
        }
        if (values[selected] === solution[selected]) {
          statusElement.textContent = "That square is already correct.";
          return;
        }
        saveUndo(selected);
        values[selected] = solution[selected];
        notes[selected].clear();
        hintCount++;
        statusElement.textContent = "A little nudge in the right direction.";
        checkWin();
        render();
        renderTasks();
      }

      function checkWin() {
        if (values.some((value, index) => value !== solution[index])) return;
        won = true;
        paused = false;
        statusElement.textContent = "Lovely work — puzzle complete!";
        if (difficultyElement.value === "easy") daily.easyWins++;
        if (hintCount < 3) daily.lowHintWins++;
        saveDaily();
        renderTasks();
      }

      function togglePause() {
        if (won) return;
        paused = !paused;
        pauseOverlay.classList.toggle("visible", paused);
        pauseButton.innerHTML = paused ? '▶ <span>Resume</span>' : 'Ⅱ <span>Pause</span>';
        pauseButton.setAttribute("aria-pressed", String(paused));
        render();
      }

      function toggleNotes() {
        if (paused || won) return;
        notesMode = !notesMode;
        notesButton.classList.toggle("active", notesMode);
        notesButton.setAttribute("aria-pressed", String(notesMode));
        statusElement.textContent = notesMode ? "Pencil notes on." : "Pencil notes off.";
      }

      function renderTasks() {
        const correct = daily.correctKeys.length;
        const tasks = [
          { name: "Solve 5 correct squares", detail: "Place correct numbers as you play.", count: Math.min(correct, 5), target: 5, complete: correct >= 5 },
          { name: "Complete an Easy puzzle", detail: "Finish any Easy puzzle today.", count: Math.min(daily.easyWins, 1), target: 1, complete: daily.easyWins > 0 },
          {
            name: "Use less than 3 hints",
            detail: daily.lowHintWins > 0 ? "You've completed this task today — lovely work." : won && hintCount < 3 ? "Puzzle finished with fewer than 3 hints!" : hintCount >= 3 ? "3 hints used this puzzle — try again on a new one." : "Finish this puzzle with 0–2 hints.",
            count: won && hintCount < 3 ? 1 : 0,
            target: 1,
            complete: daily.lowHintWins > 0
          }
        ];
        const list = document.getElementById("taskList");
        list.replaceChildren();
        for (const task of tasks) {
          const item = document.createElement("article");
          item.className = `task${task.complete ? " complete" : ""}`;
          const top = document.createElement("div");
          top.className = "task-top";
          const check = document.createElement("span");
          check.className = "task-check";
          check.setAttribute("aria-hidden", "true");
          check.textContent = task.complete ? "✓" : "";
          const name = document.createElement("span");
          name.className = "task-name";
          name.textContent = task.name;
          top.append(check, name);
          const detail = document.createElement("p");
          detail.className = "task-detail";
          detail.textContent = task.detail;
          const progress = document.createElement("div");
          progress.className = "task-progress";
          progress.setAttribute("role", "progressbar");
          progress.setAttribute("aria-valuemin", "0");
          progress.setAttribute("aria-valuemax", String(task.target));
          progress.setAttribute("aria-valuenow", String(task.count));
          const fill = document.createElement("span");
          fill.style.width = `${Math.min(task.count / task.target * 100, 100)}%`;
          progress.appendChild(fill);
          const count = document.createElement("p");
          count.className = "task-count";
          count.textContent = `${task.count} / ${task.target} ${task.target === 1 ? "complete" : "squares"}`;
          item.append(top, detail, progress, count);
          list.appendChild(item);
        }
        const completed = tasks.filter(task => task.complete).length;
        document.getElementById("taskSummary").textContent = `${completed} of ${tasks.length} complete`;
      }

      function moveSelection(rowDelta, columnDelta) {
        if (selected < 0) selected = 0;
        else {
          const row = Math.floor(selected / 9);
          const column = selected % 9;
          const nextRow = Math.max(0, Math.min(8, row + rowDelta));
          const nextColumn = Math.max(0, Math.min(8, column + columnDelta));
          selected = nextRow * 9 + nextColumn;
        }
        render();
        cellButtons[selected].focus({ preventScroll: true });
      }

      document.addEventListener("keydown", event => {
        if (event.altKey || event.metaKey || event.target.matches("select, input, textarea")) return;
        if (event.ctrlKey && event.key.toLowerCase() === "z") {
          event.preventDefault();
          undo();
          return;
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          if (event.key === "ArrowUp") moveSelection(-1, 0);
          if (event.key === "ArrowDown") moveSelection(1, 0);
          if (event.key === "ArrowLeft") moveSelection(0, -1);
          if (event.key === "ArrowRight") moveSelection(0, 1);
          return;
        }
        if (/^[1-9]$/.test(event.key)) { event.preventDefault(); enterValue(Number(event.key)); }
        else if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") { event.preventDefault(); clearSelected(); }
        else if (event.key.toLowerCase() === "n") toggleNotes();
        else if (event.key.toLowerCase() === "h") revealHint();
      });

      document.getElementById("newGame").addEventListener("click", newGame);
      undoButton.addEventListener("click", undo);
      hintButton.addEventListener("click", revealHint);
      pauseButton.addEventListener("click", togglePause);
      notesButton.addEventListener("click", toggleNotes);
      difficultyElement.addEventListener("change", newGame);
      document.querySelectorAll("[data-theme-choice]").forEach(button => {
        button.addEventListener("click", () => {
          const theme = button.dataset.themeChoice;
          document.body.dataset.theme = theme;
          document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue("--page").trim();
          document.querySelectorAll("[data-theme-choice]").forEach(option => option.setAttribute("aria-pressed", String(option === button)));
          try { localStorage.setItem("little-sudoku-theme", theme); }
          catch (error) { console.warn("Could not save the selected theme.", error); }
        });
      });
      try {
        const savedTheme = localStorage.getItem("little-sudoku-theme");
        if (savedTheme && ["blue", "pink", "yellow", "mint"].includes(savedTheme)) {
          document.body.dataset.theme = savedTheme;
          document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue("--page").trim();
          document.querySelectorAll("[data-theme-choice]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.themeChoice === savedTheme)));
        }
      } catch (error) {
        console.warn("Could not load the selected theme.", error);
      }

      makeBoardButtons();
      renderTasks();
      newGame();
      window.setInterval(() => {
        if (!paused && !won) {
          elapsedSeconds++;
          updateTimer();
        }
      }, 1000);
    })();

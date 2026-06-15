import { describe, expect, it } from "vitest";
import { checkersLogic } from "../../src/games/checkers.ts";
import type { CheckersState, CheckersBoard, CheckersEntry } from "@gamenite/shared";

// Helpers
//
// Lowercase letters encode kings in board strings:
//   '.' = empty, 'R' = red regular, 'B' = black regular,
//   'r' = red king(RK), 'b' = black king(BK).

function charToEntry(ch: string): CheckersEntry {
  switch (ch) {
    case ".":
      return ".";
    case "R":
      return "R";
    case "B":
      return "B";
    case "r":
      return "RK";
    case "b":
      return "BK";
    default:
      throw new Error(`Unknown cell: ${ch}`);
  }
}

function entryToChar(entry: CheckersEntry): string {
  switch (entry) {
    case ".":
      return ".";
    case "R":
      return "R";
    case "B":
      return "B";
    case "RK":
      return "r";
    case "BK":
      return "b";
  }
}

function mkState(nextPlayer: 0 | 1, boardStr: string): CheckersState {
  const rows = boardStr.split("/");
  if (rows.length !== 8) throw new Error(`Expected 8 rows, got ${rows.length}`);
  const board = rows.map((row) => {
    if (row.length !== 8) throw new Error(`Expected 8 cols, got ${row.length}`);
    return row.split("").map(charToEntry);
  }) as CheckersBoard;
  return { board, nextPlayer };
}

const START_BOARD =
  ".B.B.B.B/" +
  "B.B.B.B./" +
  ".B.B.B.B/" +
  "......../" +
  "......../" +
  "R.R.R.R./" +
  ".R.R.R.R/" +
  "R.R.R.R.";

const E = "........";

function boardStr(state: CheckersState): string {
  return state.board.map((row) => row.map(entryToChar).join("")).join("/");
}

// start()

describe("Checkers start()", () => {
  it("should create an 8x8 board with correct starting positions", () => {
    expect(boardStr(checkersLogic.start(2))).toBe(START_BOARD);
  });

  it("should start with player 0 (red) going first", () => {
    expect(checkersLogic.start(2).nextPlayer).toBe(0);
  });

  it("should place exactly 12 red and 12 black pieces", () => {
    const { board } = checkersLogic.start(2);
    const flat = board.flat();
    expect(flat.filter((c) => c === "R").length).toBe(12);
    expect(flat.filter((c) => c === "B").length).toBe(12);
  });

  it("should only place pieces on dark squares", () => {
    const { board } = checkersLogic.start(2);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 0) expect(board[row][col]).toBe(".");
      }
    }
  });
});

// update() — invalid moves

describe("Checkers update() — invalid moves", () => {
  it("should reject a move when it is not the player's turn", () => {
    const state = checkersLogic.start(2);
    expect(
      checkersLogic.update(
        state,
        {
          squares: [
            [5, 0],
            [4, 1],
          ],
        },
        1,
      ),
    ).toBeNull();
  });

  it("should reject ill-formed move payloads", () => {
    const state = checkersLogic.start(2);
    expect(checkersLogic.update(state, "bad", 0)).toBeNull();
    expect(checkersLogic.update(state, null, 0)).toBeNull();
    expect(checkersLogic.update(state, { from: [5, 0], to: [4, 1] }, 0)).toBeNull();
    expect(checkersLogic.update(state, { squares: [[5, 0]] }, 0)).toBeNull();
  });

  it("should reject an out-of-bounds move", () => {
    const state = checkersLogic.start(2);
    expect(
      checkersLogic.update(
        state,
        {
          squares: [
            [5, 0],
            [8, 1],
          ],
        },
        0,
      ),
    ).toBeNull();
  });

  it("should reject moving an opponent's piece", () => {
    const state = checkersLogic.start(2);
    expect(
      checkersLogic.update(
        state,
        {
          squares: [
            [2, 1],
            [3, 2],
          ],
        },
        0,
      ),
    ).toBeNull();
  });

  it("should reject a move not in the legal move list", () => {
    const state = checkersLogic.start(2);
    expect(
      checkersLogic.update(
        state,
        {
          squares: [
            [5, 0],
            [6, 0],
          ],
        },
        0,
      ),
    ).toBeNull();
  });

  it("should reject a move after the game is over", () => {
    const s = mkState(1, `${E}/${E}/${E}/${E}/${E}/` + "R.R.R.R./" + ".R.R.R.R/" + "R.R.R.R.");
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [5, 0],
            [4, 1],
          ],
        },
        0,
      ),
    ).toBeNull();
  });
});

// update() — forward-only restriction for regular pieces

describe("Checkers update() — regular piece forward only", () => {
  it("red regular may move forward", () => {
    const s = mkState(0, `${E}/${E}/${E}/${E}/` + ".R....../" + `${E}/${E}/${E}`);
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [3, 0],
          ],
        },
        0,
      ),
    ).not.toBeNull();
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [3, 2],
          ],
        },
        0,
      ),
    ).not.toBeNull();
  });

  it("red regular can't move backward", () => {
    const s = mkState(0, `${E}/${E}/${E}/${E}/` + ".R....../" + `${E}/${E}/${E}`);
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [5, 0],
          ],
        },
        0,
      ),
    ).toBeNull();
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [5, 2],
          ],
        },
        0,
      ),
    ).toBeNull();
  });

  it("black regular can move forward", () => {
    const s = mkState(1, `${E}/${E}/${E}/${E}/` + ".B....../" + `${E}/${E}/${E}`);
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [5, 0],
          ],
        },
        1,
      ),
    ).not.toBeNull();
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [5, 2],
          ],
        },
        1,
      ),
    ).not.toBeNull();
  });

  it("black regular can't move backward", () => {
    const s = mkState(1, `${E}/${E}/${E}/${E}/` + ".B....../" + `${E}/${E}/${E}`);
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [3, 0],
          ],
        },
        1,
      ),
    ).toBeNull();
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [3, 2],
          ],
        },
        1,
      ),
    ).toBeNull();
  });

  it("should move the piece and leave origin empty", () => {
    const s = mkState(0, `${E}/${E}/${E}/${E}/` + ".R....../" + `${E}/${E}/${E}`);
    const next = checkersLogic.update(
      s,
      {
        squares: [
          [4, 1],
          [3, 2],
        ],
      },
      0,
    )!;
    expect(next.board[4][1]).toBe(".");
    expect(next.board[3][2]).toBe("R");
    expect(next.nextPlayer).toBe(1);
  });

  it("should alternate turns", () => {
    const s0 = checkersLogic.start(2);
    const s1 = checkersLogic.update(
      s0,
      {
        squares: [
          [5, 0],
          [4, 1],
        ],
      },
      0,
    )!;
    expect(s1.nextPlayer).toBe(1);
    const s2 = checkersLogic.update(
      s1,
      {
        squares: [
          [2, 1],
          [3, 2],
        ],
      },
      1,
    )!;
    expect(s2.nextPlayer).toBe(0);
  });
});

// update, kings move all 4 directions

describe("Checkers update() — king movement", () => {
  it("red king can move in all 4 diagonal directions", () => {
    const s = mkState(0, `${E}/${E}/${E}/${E}/` + ".r....../" + `${E}/${E}/${E}`);
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [3, 0],
          ],
        },
        0,
      ),
    ).not.toBeNull();
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [3, 2],
          ],
        },
        0,
      ),
    ).not.toBeNull();
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [5, 0],
          ],
        },
        0,
      ),
    ).not.toBeNull();
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [5, 2],
          ],
        },
        0,
      ),
    ).not.toBeNull();
  });

  it("black king may move backward", () => {
    const s = mkState(1, `${E}/${E}/${E}/${E}/` + ".b....../" + `${E}/${E}/${E}`);
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [3, 0],
          ],
        },
        1,
      ),
    ).not.toBeNull();
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [3, 2],
          ],
        },
        1,
      ),
    ).not.toBeNull();
  });

  it("king retains king status after moving", () => {
    const s = mkState(0, `${E}/${E}/${E}/${E}/` + ".r....../" + `${E}/${E}/${E}`);
    const next = checkersLogic.update(
      s,
      {
        squares: [
          [4, 1],
          [5, 2],
        ],
      },
      0,
    )!;
    expect(next.board[5][2]).toBe("RK");
  });
});

// update(), promotion

describe("Checkers update() — king promotion", () => {
  it("promotes a red piece that reaches row 0", () => {
    const s = mkState(0, `${E}/` + ".R....../" + `${E}/${E}/${E}/${E}/${E}/${E}`);
    const next = checkersLogic.update(
      s,
      {
        squares: [
          [1, 1],
          [0, 0],
        ],
      },
      0,
    )!;
    expect(next.board[0][0]).toBe("RK");
  });

  it("promotes a black piece that reaches row 7", () => {
    const s = mkState(1, `${E}/${E}/${E}/${E}/${E}/${E}/` + ".B....../" + `${E}`);
    const next = checkersLogic.update(
      s,
      {
        squares: [
          [6, 1],
          [7, 0],
        ],
      },
      1,
    )!;
    expect(next.board[7][0]).toBe("BK");
  });

  it("promotes a red piece that captures into row 0", () => {
    const s = mkState(0, ".B....../" + "..R...../" + `${E}/${E}/${E}/${E}/${E}/${E}`);
    const next = checkersLogic.update(
      s,
      { squares: [[1, 2], [-1, 0].map(Math.abs) as [number, number]] },
      0,
    );
    const s2 = mkState(0, `${E}/` + "..B...../" + ".R....../" + `${E}/${E}/${E}/${E}/${E}`);
    const next2 = checkersLogic.update(
      s2,
      {
        squares: [
          [2, 1],
          [0, 3],
        ],
      },
      0,
    )!;
    expect(next2.board[0][3]).toBe("RK");
    expect(next2.board[1][2]).toBe(".");
    expect(next).toBeDefined(); // suppress unused error
  });
});

// update() — captures

describe("Checkers update() — captures", () => {
  it("should allow red to capture forward", () => {
    const s = mkState(0, `${E}/${E}/${E}/` + "..B...../" + ".R....../" + `${E}/${E}/${E}`);
    const next = checkersLogic.update(
      s,
      {
        squares: [
          [4, 1],
          [2, 3],
        ],
      },
      0,
    )!;
    expect(next.board[4][1]).toBe(".");
    expect(next.board[3][2]).toBe(".");
    expect(next.board[2][3]).toBe("R");
  });

  it("should allow black to capture forward", () => {
    const s = mkState(1, `${E}/${E}/${E}/` + "..B...../" + "...R..../" + `${E}/${E}/${E}`);
    const next = checkersLogic.update(
      s,
      {
        squares: [
          [3, 2],
          [5, 4],
        ],
      },
      1,
    )!;
    expect(next.board[3][2]).toBe(".");
    expect(next.board[4][3]).toBe(".");
    expect(next.board[5][4]).toBe("B");
  });

  it("should enforce mandatory captures", () => {
    const s = mkState(0, `${E}/${E}/${E}/` + "..B...../" + ".R....../" + `${E}/${E}/${E}`);
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [4, 1],
            [3, 0],
          ],
        },
        0,
      ),
    ).toBeNull();
  });

  it("regular pieces capture only once even if another is available", () => {
    // Red at (6,1) captures black at (5,2) landing at (4,3).
    // From (4,3) there's another black at (3,4); a chain would land at (2,5).
    const s = mkState(
      0,
      `${E}/${E}/${E}/` + "....B.../" + `${E}/` + "..B...../" + ".R....../" + `${E}`,
    );
    const next = checkersLogic.update(
      s,
      {
        squares: [
          [6, 1],
          [4, 3],
        ],
      },
      0,
    )!;
    expect(next.board[6][1]).toBe(".");
    expect(next.board[5][2]).toBe(".");
    expect(next.board[4][3]).toBe("R");
    expect(next.board[3][4]).toBe("B"); // second black piece untouched
    const s2 = mkState(
      0,
      `${E}/${E}/${E}/` + "....B.../" + `${E}/` + "..B...../" + ".R....../" + `${E}`,
    );
    expect(
      checkersLogic.update(
        s2,
        {
          squares: [
            [6, 1],
            [4, 3],
            [2, 5],
          ],
        },
        0,
      ),
    ).toBeNull();
  });
});

// update() — king multi-capture chains

describe("Checkers update() — king multi-capture chains", () => {
  it("king must continue capturing while captures are available", () => {
    // r at (5,2), B at (4,3) and (2,5). Chain: (5,2)->(3,4) capturing (4,3), then (3,4)->(1,6) capturing (2,5).
    const s = mkState(
      0,
      `${E}/${E}/` + ".....B../" + `${E}/` + "...B..../" + "..r...../" + `${E}/${E}`,
    );
    expect(
      checkersLogic.update(
        s,
        {
          squares: [
            [5, 2],
            [3, 4],
          ],
        },
        0,
      ),
    ).toBeNull();
    const next = checkersLogic.update(
      s,
      {
        squares: [
          [5, 2],
          [3, 4],
          [1, 6],
        ],
      },
      0,
    )!;
    expect(next.board[5][2]).toBe(".");
    expect(next.board[4][3]).toBe(".");
    expect(next.board[3][4]).toBe(".");
    expect(next.board[2][5]).toBe(".");
    expect(next.board[1][6]).toBe("RK");
  });

  it("king terminates the chain when no further captures are possible", () => {
    const s = mkState(0, `${E}/${E}/${E}/${E}/` + "...B..../" + "..r...../" + `${E}/${E}`);
    const next = checkersLogic.update(
      s,
      {
        squares: [
          [5, 2],
          [3, 4],
        ],
      },
      0,
    )!;
    expect(next.board[3][4]).toBe("RK");
    expect(next.board[4][3]).toBe(".");
  });
});

// isDone()

describe("Checkers isDone()", () => {
  it("should return false at game start", () => {
    expect(checkersLogic.isDone(checkersLogic.start(2))).toBe(false);
  });

  it("should return true when the current player has no pieces", () => {
    const s = mkState(1, `${E}/${E}/${E}/${E}/${E}/` + "R.R.R.R./" + ".R.R.R.R/" + "R.R.R.R.");
    expect(checkersLogic.isDone(s)).toBe(true);
  });

  it("should return true when the current player has pieces but no legal moves", () => {
    const s = mkState(1, `${E}/${E}/${E}/${E}/${E}/` + ".......B/" + "......R./" + ".....R..");
    expect(checkersLogic.isDone(s)).toBe(true);
  });
});

// viewAs()

describe("Checkers viewAs()", () => {
  it("should expose board, nextPlayer, winner null in ongoing game", () => {
    const state = checkersLogic.start(2);
    const view = checkersLogic.viewAs(state, 0);
    expect(view.board).toStrictEqual(state.board);
    expect(view.nextPlayer).toBe(0);
    expect(view.winner).toBeNull();
  });

  it("should include legalMoves for the current player", () => {
    const state = checkersLogic.start(2);
    const view = checkersLogic.viewAs(state, 0);
    expect(view.legalMoves.length).toBeGreaterThan(0);
    for (const move of view.legalMoves) {
      const [r, c] = move.squares[0];
      expect(state.board[r][c]).toBe("R");
    }
  });

  it("should return the same view for all players", () => {
    const state = checkersLogic.start(2);
    expect(checkersLogic.viewAs(state, 0)).toStrictEqual(checkersLogic.viewAs(state, 1));
  });

  it("should set winner and empty legalMoves when game is over", () => {
    const s = mkState(1, `${E}/${E}/${E}/${E}/${E}/` + "R.R.R.R./" + ".R.R.R.R/" + "R.R.R.R.");
    const view = checkersLogic.viewAs(s, 0);
    expect(view.winner).toBe(0);
    expect(view.nextPlayer).toBe(-1);
    expect(view.legalMoves).toStrictEqual([]);
  });

  it("should only include captures when captures are available", () => {
    const s = mkState(0, `${E}/${E}/${E}/` + "..B...../" + ".R....../" + `${E}/${E}/${E}`);
    const view = checkersLogic.viewAs(s, 0);
    for (const move of view.legalMoves) {
      const [fr] = move.squares[0];
      const [tr] = move.squares[move.squares.length - 1];
      expect(Math.abs(tr - fr)).toBe(2);
    }
  });

  it("includes multi-step sequences when a king has a capture chain", () => {
    const s = mkState(
      0,
      `${E}/${E}/` + ".....B../" + `${E}/` + "...B..../" + "..r...../" + `${E}/${E}`,
    );
    const view = checkersLogic.viewAs(s, 0);
    expect(view.legalMoves.some((m) => m.squares.length === 3)).toBe(true);
  });
});

// isWinningMove()

describe("Checkers isWinningMove()", () => {
  it("should return true for a capture that leaves the opponent with no pieces", () => {
    const s = mkState(0, `${E}/${E}/${E}/` + "..B...../" + ".R....../" + `${E}/${E}/${E}`);
    expect(
      checkersLogic.isWinningMove!(s, {
        squares: [
          [4, 1],
          [2, 3],
        ],
      }),
    ).toBe(true);
  });

  it("should return false for an illegal move", () => {
    const s = mkState(0, `${E}/${E}/${E}/` + "..B...../" + ".R....../" + `${E}/${E}/${E}`);
    // a capture is available, so this simple move is illegal
    expect(
      checkersLogic.isWinningMove!(s, {
        squares: [
          [4, 1],
          [3, 0],
        ],
      }),
    ).toBe(false);
  });

  it("should return false for a legal move that doesn't end the game", () => {
    const s = checkersLogic.start(2);
    expect(
      checkersLogic.isWinningMove!(s, {
        squares: [
          [5, 0],
          [4, 1],
        ],
      }),
    ).toBe(false);
  });
});

// tagView()

describe("Checkers tagView()", () => {
  it("should tag the view with type checkers", () => {
    const state = checkersLogic.start(2);
    const view = checkersLogic.viewAs(state, 0);
    expect(checkersLogic.tagView(view)).toStrictEqual({ type: "checkers", view });
  });
});

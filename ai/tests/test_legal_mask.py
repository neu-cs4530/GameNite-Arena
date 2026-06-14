"""Legal-action masking: the model must never return an illegal fixed-action
move (a full connect4 column / occupied tictactoe cell), which would freeze
the game when the server rejects it."""
import encoders


def test_connect4_mask_excludes_full_columns():
    board = [[0, 1, 0, 0, 0, 0, 0]] + [[0, 1, 0, 0, 0, 0, 0]] * 5  # column 1 full
    mask = encoders.legal_action_mask("connect4", {"board": board}, 7)
    assert mask[1] is False
    assert all(mask[c] for c in (0, 2, 3, 4, 5, 6))


def test_tictactoe_mask_excludes_occupied_cells():
    board = [1, 0, -1, 0, 0, 0, 0, 0, 0]
    mask = encoders.legal_action_mask("tictactoe", {"board": board}, 9)
    assert mask[0] is False and mask[2] is False
    assert mask[1] is True and mask[8] is True


def test_nim_mask_caps_take_to_remaining():
    assert encoders.legal_action_mask("nim", {"remaining": 1}, 3) == [True, False, False]
    assert encoders.legal_action_mask("nim", {"remaining": 5}, 3) == [True, True, True]


def test_unknown_or_missing_state_is_all_legal():
    assert encoders.legal_action_mask("connect4", None, 7) == [True] * 7
    assert encoders.legal_action_mask("numguesser", {"x": 1}, 100) == [True] * 100

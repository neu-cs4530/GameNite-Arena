"""
GameNite Arena — Unit Tests: generic trainer CLI (ai/train.py)
==============================================================
train.py is THE kit entrypoint. These tests cover its pure parts —
heuristic-to-env-param mapping, chunk math, CLI validation — and the
attach/self-register dispatch with the session and trainer monkeypatched
(no network, no SB3).

Run:
    pytest ai/tests/test_train_cli.py -v
"""

import pytest

import train


# 1. heuristics -> NimEnv params


class TestNimHeuristicMapping:

    def test_defaults_when_missing(self):
        for heuristics in (None, {}, "garbled", 42, []):
            params = train.nim_env_params(heuristics)
            assert params["opponent_style"] == "misere"
            assert params["opponent_mistake_rate"] == pytest.approx(0.25)
            assert params["random_start"] is True
            assert params["start_low"] == 8
            assert params["reward_shaping"] is False
            assert params["starting_pile"] == 21

    def test_blunder_15(self):
        params = train.nim_env_params({"opponentStyle": "misere-blunder-15"})
        assert params["opponent_style"] == "misere"
        assert params["opponent_mistake_rate"] == pytest.approx(0.15)

    def test_uniform_random_opponent(self):
        params = train.nim_env_params({"opponentStyle": "uniform-random"})
        assert params["opponent_style"] == "uniform-random"

    def test_fixed_21_start(self):
        params = train.nim_env_params({"startingPile": "fixed-21"})
        assert params["random_start"] is False

    def test_potential_mod4_shaping(self):
        params = train.nim_env_params({"rewardShaping": "potential-mod4"})
        assert params["reward_shaping"] is True

    def test_unknown_value_falls_back_per_key(self):
        params = train.nim_env_params({
            "opponentStyle": "psychic",
            "startingPile": "fixed-21",          # valid one still applies
            "rewardShaping": "double-points",
        })
        assert params["opponent_style"] == "misere"
        assert params["opponent_mistake_rate"] == pytest.approx(0.25)
        assert params["random_start"] is False
        assert params["reward_shaping"] is False

    def test_params_are_valid_nim_env_kwargs(self):
        from adapter.example_nim_adapter import NimEnv
        env = NimEnv(**train.nim_env_params({
            "opponentStyle": "misere-blunder-15",
            "startingPile": "fixed-21",
            "rewardShaping": "potential-mod4",
        }))
        assert env.opponent_mistake_rate == pytest.approx(0.15)
        assert env.random_start is False
        assert env.reward_shaping is True


# 2. chunk math


class TestPlanChunks:

    def test_exact_multiple(self):
        assert train.plan_chunks(30720, 2048) == 15

    def test_rounds_up(self):
        assert train.plan_chunks(2049, 2048) == 2

    def test_tiny_run_is_one_chunk(self):
        assert train.plan_chunks(1, 2048) == 1

    def test_zero_steps_rejected(self):
        with pytest.raises(ValueError):
            train.plan_chunks(0, 2048)

    def test_bad_chunk_size_rejected(self):
        with pytest.raises(ValueError):
            train.plan_chunks(1000, 0)


# 3. CLI validation


def parse(argv, monkeypatch=None):
    return train.build_parser().parse_args(argv)


class TestCliValidation:

    def test_token_alone_is_enough(self):
        args = parse(["--token", "t" * 32, "--game", "nim"])
        assert train.validate_args(args) is None

    def test_username_password_is_enough(self):
        args = parse(["--username", "u", "--password", "p", "--game", "nim"])
        assert train.validate_args(args) is None

    def test_no_auth_rejected(self, monkeypatch):
        monkeypatch.delenv("GAMENITE_TOKEN", raising=False)
        args = parse(["--game", "nim"])
        assert "token" in train.validate_args(args)

    def test_username_without_password_rejected(self):
        args = parse(["--username", "u", "--game", "nim"])
        assert train.validate_args(args) is not None

    def test_game_required_without_job_id(self, monkeypatch):
        monkeypatch.delenv("GAMENITE_JOB_ID", raising=False)
        args = parse(["--token", "t" * 32])
        assert "--game" in train.validate_args(args)

    def test_job_id_makes_game_optional(self):
        args = parse(["--token", "t" * 32, "--job-id", "j1"])
        assert train.validate_args(args) is None

    def test_token_from_env(self, monkeypatch):
        monkeypatch.setenv("GAMENITE_TOKEN", "envtoken-envtoken")
        args = parse(["--game", "nim"])
        assert args.token == "envtoken-envtoken"
        assert train.validate_args(args) is None

    def test_job_id_from_env(self, monkeypatch):
        monkeypatch.setenv("GAMENITE_JOB_ID", "env-job-1")
        args = parse(["--token", "t" * 32])
        assert args.job_id == "env-job-1"


# 4. main() dispatch (session + trainer stubbed)


class FakeSession:
    def __init__(self, job_info=None):
        self.job_info = job_info or {}
        self.attached = None
        self.started = None
        self.job_id = None

    def get_job(self, job_id=None):
        return self.job_info

    def attach(self, job_id):
        self.attached = job_id
        self.job_id = job_id
        return job_id

    def start(self, game_key, *, episodes, learning_rate, **kwargs):
        self.started = {"gameKey": game_key, "episodes": episodes,
                        "learningRate": learning_rate, **kwargs}
        self.job_id = "new-job-1"
        return self.job_id


@pytest.fixture
def fake_run(monkeypatch):
    """Replace the nim runner; record what main() hands it."""
    calls = []

    def runner(session, **kwargs):
        calls.append({"session": session, **kwargs})
        return 0

    monkeypatch.setitem(train.TRAINERS, "nim", runner)
    return calls


def use_session(monkeypatch, fake):
    monkeypatch.setattr(train, "GameNiteSession", lambda *a, **k: fake)
    return fake


class TestMainDispatch:

    def test_job_id_path_fetches_job_and_attaches(self, monkeypatch, fake_run):
        fake = use_session(monkeypatch, FakeSession(job_info={
            "jobId": "web-7", "gameKey": "nim", "status": "queued",
            "config": {"episodes": 4096, "learningRate": 0.001,
                       "extra": {"heuristics": {"opponentStyle": "uniform-random"}}},
        }))

        rc = train.main(["--token", "t" * 32, "--job-id", "web-7"])

        assert rc == 0
        assert fake.attached == "web-7"
        assert fake.started is None              # the web form registered it
        [call] = fake_run
        assert call["episodes"] == 4096
        assert call["learning_rate"] == pytest.approx(0.001)
        assert call["heuristics"] == {"opponentStyle": "uniform-random"}

    def test_job_for_unsupported_game_exits_with_message(
        self, monkeypatch, fake_run, capsys
    ):
        use_session(monkeypatch, FakeSession(job_info={
            "jobId": "web-8", "gameKey": "checkers", "status": "queued",
            "config": {"episodes": 100, "learningRate": 0.001},
        }))

        rc = train.main(["--token", "t" * 32, "--job-id", "web-8"])

        assert rc == 2
        assert fake_run == []
        err = capsys.readouterr().err
        assert "no local trainer for 'checkers'" in err
        assert "nim" in err

    def test_self_register_path_starts_a_session(self, monkeypatch, fake_run):
        fake = use_session(monkeypatch, FakeSession())

        rc = train.main(["--token", "t" * 32, "--game", "nim",
                         "--episodes", "8192", "--learning-rate", "0.0005"])

        assert rc == 0
        assert fake.attached is None
        assert fake.started["gameKey"] == "nim"
        assert fake.started["episodes"] == 8192
        assert fake.started["learningRate"] == pytest.approx(0.0005)
        [call] = fake_run
        assert call["heuristics"] is None        # defaults apply locally

    def test_self_register_unsupported_game_never_registers(
        self, monkeypatch, fake_run, capsys
    ):
        fake = use_session(monkeypatch, FakeSession())

        rc = train.main(["--token", "t" * 32, "--game", "guess"])

        assert rc == 2
        assert fake.started is None              # nothing registered
        assert fake_run == []
        assert "no local trainer for 'guess'" in capsys.readouterr().err

    def test_connect4_and_tictactoe_are_registered_trainers(self):
        # The bug report: connect4 printed "no local trainer". These are now
        # real trainers, alongside nim.
        assert "connect4" in train.TRAINERS
        assert "tictactoe" in train.TRAINERS
        assert "nim" in train.TRAINERS

    def test_connect4_self_register_dispatches(self, monkeypatch):
        fake = use_session(monkeypatch, FakeSession())
        calls = []
        monkeypatch.setitem(train.TRAINERS, "connect4",
                            lambda session, **kw: calls.append(kw) or 0)

        rc = train.main(["--token", "t" * 32, "--game", "connect4",
                         "--episodes", "4096"])

        assert rc == 0
        assert fake.started["gameKey"] == "connect4"
        assert calls and calls[0]["episodes"] == 4096

    def test_tictactoe_job_attaches(self, monkeypatch):
        fake = use_session(monkeypatch, FakeSession(job_info={
            "jobId": "web-9", "gameKey": "tictactoe", "status": "queued",
            "config": {"episodes": 2048, "learningRate": 0.0003},
        }))
        calls = []
        monkeypatch.setitem(train.TRAINERS, "tictactoe",
                            lambda session, **kw: calls.append(kw) or 0)

        rc = train.main(["--token", "t" * 32, "--job-id", "web-9"])

        assert rc == 0
        assert fake.attached == "web-9"
        assert calls and calls[0]["episodes"] == 2048

    def test_checkers_still_unsupported(self, monkeypatch, capsys):
        # checkers stays stubbed (dynamic action space + no rules engine).
        use_session(monkeypatch, FakeSession(job_info={
            "jobId": "web-10", "gameKey": "checkers", "status": "queued",
            "config": {"episodes": 100, "learningRate": 0.001},
        }))
        rc = train.main(["--token", "t" * 32, "--job-id", "web-10"])
        assert rc == 2
        assert "no local trainer for 'checkers'" in capsys.readouterr().err

    def test_invalid_args_exit_2_before_any_network(self, monkeypatch, capsys):
        monkeypatch.delenv("GAMENITE_TOKEN", raising=False)
        monkeypatch.delenv("GAMENITE_JOB_ID", raising=False)

        def boom(*a, **k):
            raise AssertionError("session must not be constructed")

        monkeypatch.setattr(train, "GameNiteSession", boom)
        rc = train.main(["--game", "nim"])
        assert rc == 2
        assert capsys.readouterr().err != ""

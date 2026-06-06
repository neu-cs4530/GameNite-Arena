# ai/tests/conftest.py
# Adds the ai/ directory to sys.path so all imports resolve correctly.

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'adapter'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'inference-service'))

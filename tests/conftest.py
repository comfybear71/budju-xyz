"""Shared fixtures for BUDJU API tests."""

import sys
import os

# Add the api/ directory to Python path so we can import modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

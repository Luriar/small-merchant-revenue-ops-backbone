import os
import sys
from pathlib import Path

# Ensure project root is on the path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Point to samples directory for all tests
os.environ["LOCAL_DATA_ROOT"] = str(PROJECT_ROOT / "data")
os.environ["USE_SAMPLE_DATA"] = "true"

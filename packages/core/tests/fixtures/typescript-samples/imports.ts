// Default import
import fs from 'fs';

// Named imports
import { join, resolve } from 'path';

// Namespace import
import * as os from 'os';

// Type-only import
import type { Stats } from 'fs';

// Mixed import (default + named)
import React, { useState, useEffect } from 'react';

// Side-effect import
import './styles.css';

// Dynamic import (in function)
async function loadModule() {
  const mod = await import('./dynamic-module');
  return mod;
}

export {};

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const BLUEPRINTS_FILE = path.join(__dirname, '..', 'vulkan_blueprints.json');

// Get all blueprints
router.get('/', (req, res) => {
  if (fs.existsSync(BLUEPRINTS_FILE)) {
    try {
      const data = fs.readFileSync(BLUEPRINTS_FILE, 'utf8');
      res.json(JSON.parse(data));
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse blueprints file' });
    }
  } else {
    res.json([]);
  }
});

// Save a new blueprint
router.post('/', (req, res) => {
  const newBlueprint = req.body;
  if (!newBlueprint.id || !newBlueprint.name || !newBlueprint.agents) {
    return res.status(400).json({ error: 'Invalid blueprint format' });
  }

  let blueprints = [];
  if (fs.existsSync(BLUEPRINTS_FILE)) {
    try {
      blueprints = JSON.parse(fs.readFileSync(BLUEPRINTS_FILE, 'utf8'));
    } catch (e) {
      blueprints = [];
    }
  }

  // Update if exists, else push
  const existingIndex = blueprints.findIndex(b => b.id === newBlueprint.id);
  if (existingIndex >= 0) {
    blueprints[existingIndex] = newBlueprint;
  } else {
    blueprints.push(newBlueprint);
  }

  fs.writeFileSync(BLUEPRINTS_FILE, JSON.stringify(blueprints, null, 2));
  res.json({ success: true, blueprint: newBlueprint });
});

export default router;


import express from 'express';
import multer from 'multer';
import { analyzeVideo, generateReport } from '../controllers/srt.controller.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('video'), analyzeVideo);
router.get('/report/:id', generateReport);

export default router;
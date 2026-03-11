"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const multer_1 = __importDefault(require("multer"));
const errors_1 = require("../utils/errors");
const uploadDir = path_1.default.join(process.cwd(), 'uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const allowedMimeTypes = new Set([
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const extension = (path_1.default.extname(file.originalname || '').toLowerCase() || '.bin').slice(0, 10);
        const token = crypto_1.default.randomUUID();
        cb(null, `${Date.now()}-${token}${extension}`);
    },
});
function fileFilter(_req, file, cb) {
    if (!allowedMimeTypes.has(file.mimetype)) {
        cb(new errors_1.ValidationError('Unsupported file type. Allowed: pdf, txt, doc, docx, xls, xlsx'));
        return;
    }
    cb(null, true);
}
const maxUploadBytes = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 25)) * 1024 * 1024;
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: maxUploadBytes,
        files: 1,
    },
});
//# sourceMappingURL=upload.js.map
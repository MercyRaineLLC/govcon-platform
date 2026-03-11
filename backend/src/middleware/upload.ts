import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import multer, { FileFilterCallback } from 'multer'
import { ValidationError } from '../utils/errors'

const uploadDir = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const allowedMimeTypes = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extension = (path.extname(file.originalname || '').toLowerCase() || '.bin').slice(0, 10)
    const token = crypto.randomUUID()
    cb(null, `${Date.now()}-${token}${extension}`)
  },
})

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) {
  if (!allowedMimeTypes.has(file.mimetype)) {
    cb(new ValidationError('Unsupported file type. Allowed: pdf, txt, doc, docx, xls, xlsx'))
    return
  }

  cb(null, true)
}

const maxUploadBytes = Math.max(
  1,
  Number(process.env.MAX_UPLOAD_MB || 25)
) * 1024 * 1024

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxUploadBytes,
    files: 1,
  },
})

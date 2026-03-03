"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const upload_1 = require("../middleware/upload");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
// POST /api/documents/upload
router.post('/upload', upload_1.upload.single('file'), async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { opportunityId } = req.body;
        if (!opportunityId)
            throw new errors_1.ValidationError('opportunityId required');
        if (!req.file)
            throw new errors_1.ValidationError('File required');
        const opportunity = await database_1.prisma.opportunity.findFirst({ where: { id: opportunityId, consultingFirmId } });
        if (!opportunity)
            throw new errors_1.NotFoundError('Opportunity not found');
        const document = await database_1.prisma.opportunityDocument.create({
            data: {
                opportunityId,
                fileName: req.file.originalname,
                fileUrl: `/uploads/${req.file.filename}`,
                storageKey: req.file.filename,
                fileType: req.file.mimetype,
                fileSize: req.file.size,
                isAmendment: req.body.isAmendment === 'true',
                analysisStatus: 'PENDING',
            },
        });
        logger_1.logger.info('Document uploaded', { documentId: document.id, opportunityId });
        res.json({ success: true, data: document });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/documents/:opportunityId
router.get('/:opportunityId', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const opportunity = await database_1.prisma.opportunity.findFirst({ where: { id: req.params.opportunityId, consultingFirmId } });
        if (!opportunity)
            throw new errors_1.NotFoundError('Opportunity not found');
        const documents = await database_1.prisma.opportunityDocument.findMany({ where: { opportunityId: req.params.opportunityId }, orderBy: { uploadedAt: 'desc' } });
        res.json({ success: true, data: documents });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /api/documents/:documentId
router.delete('/:documentId', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const doc = await database_1.prisma.opportunityDocument.findFirst({ where: { id: req.params.documentId }, include: { opportunity: { select: { consultingFirmId: true } } } });
        if (!doc || doc.opportunity.consultingFirmId !== consultingFirmId)
            throw new errors_1.NotFoundError('Document not found');
        if (doc.storageKey) {
            const filePath = path_1.default.join(process.cwd(), 'uploads', doc.storageKey);
            if (fs_1.default.existsSync(filePath))
                fs_1.default.unlinkSync(filePath);
        }
        await database_1.prisma.opportunityDocument.delete({ where: { id: req.params.documentId } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=documents.js.map
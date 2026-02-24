/**
 * MCP UTILITIES API ROUTES
 * ========================
 *
 * API endpoints for MCP server detection and configuration utilities.
 */

import express from 'express';

const router = express.Router();

/**
 * GET /api/mcp-utils/all-servers
 * Get all configured MCP servers
 */
router.get('/all-servers', async (req, res) => {
    try {
        // Return empty result - MCP server detection simplified
        res.json({ servers: [] });
    } catch (error) {
        console.error('MCP servers detection error:', error);
        res.status(500).json({
            error: 'Failed to get MCP servers',
            message: error.message
        });
    }
});

export default router;

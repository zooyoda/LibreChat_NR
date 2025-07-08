import { AttachmentIndexService } from '../../../modules/attachments/index-service.js';
import { AttachmentCleanupService } from '../../../modules/attachments/cleanup-service.js';
import { AttachmentResponseTransformer } from '../../../modules/attachments/response-transformer.js';

describe('Attachment System', () => {
  let indexService: AttachmentIndexService;
  let cleanupService: AttachmentCleanupService;
  let responseTransformer: AttachmentResponseTransformer;

  beforeEach(() => {
    // Reset singleton instance for test isolation
    // @ts-expect-error - Accessing private static for testing
    AttachmentIndexService.instance = undefined;
    indexService = AttachmentIndexService.getInstance();
    cleanupService = new AttachmentCleanupService(indexService);
    responseTransformer = new AttachmentResponseTransformer(indexService);
  });

  afterEach(() => {
    cleanupService.stop();
    jest.clearAllTimers();
  });

  describe('AttachmentIndexService', () => {
    it('should store and retrieve attachment metadata', () => {
      const messageId = 'msg123';
      const attachment = {
        id: 'att123',
        name: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024
      };

      indexService.addAttachment(messageId, attachment);
      const metadata = indexService.getMetadata(messageId, 'test.pdf');

      expect(metadata).toBeDefined();
      expect(metadata?.originalId).toBe('att123');
      expect(metadata?.filename).toBe('test.pdf');
      expect(metadata?.mimeType).toBe('application/pdf');
      expect(metadata?.size).toBe(1024);
    });

    it('should handle size limits', () => {
      // Add max entries + 1
      for (let i = 0; i < 257; i++) {
        indexService.addAttachment(`msg${i}`, {
          id: `att${i}`,
          name: 'test.pdf',
          mimeType: 'application/pdf',
          size: 1024
        });
      }

      // Size should be maintained at or below max
      expect(indexService.size).toBeLessThanOrEqual(256);
    });

    it('should handle expiry', () => {
      const messageId = 'msg123';
      const attachment = {
        id: 'att123',
        name: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024
      };

      // Add attachment
      indexService.addAttachment(messageId, attachment);
      
      // Mock time passing
      jest.useFakeTimers();
      jest.advanceTimersByTime(3600000 + 1000); // 1 hour + 1 second

      // Attempt to retrieve expired attachment
      const metadata = indexService.getMetadata(messageId, 'test.pdf');
      expect(metadata).toBeUndefined();

      jest.useRealTimers();
    });
  });

  describe('AttachmentCleanupService', () => {
    it('should start and stop cleanup service', () => {
      cleanupService.start();
      expect(cleanupService.getCurrentInterval()).toBe(300000); // Base interval
      cleanupService.stop();
      expect(cleanupService.getCurrentInterval()).toBe(300000);
    });
  });

  describe('AttachmentResponseTransformer', () => {
    it('should transform attachments to simplified format', () => {
      const messageId = 'msg123';
      const fullResponse = {
        id: messageId,
        attachments: [{
          id: 'att123',
          name: 'test.pdf',
          mimeType: 'application/pdf',
          size: 1024
        }]
      };

      // Store attachment metadata
      indexService.addAttachment(messageId, fullResponse.attachments[0]);

      // Transform response
      const simplified = responseTransformer.transformResponse(fullResponse);

      expect(simplified).toEqual({
        id: messageId,
        attachments: [{
          name: 'test.pdf'
        }]
      });
    });

    it('should handle responses without attachments', () => {
      const response = {
        id: 'msg123',
        subject: 'Test'
      };

      const simplified = responseTransformer.transformResponse(response);
      expect(simplified).toEqual(response);
    });
  });

  describe('Integration', () => {
    it('should maintain attachment metadata through transform cycle', () => {
      const messageId = 'msg123';
      const originalAttachment = {
        id: 'att123',
        name: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024
      };

      // Add attachment and transform response
      indexService.addAttachment(messageId, originalAttachment);
      const transformed = responseTransformer.transformResponse({
        id: messageId,
        attachments: [originalAttachment]
      });

      // Verify simplified format
      expect(transformed.attachments?.[0]).toEqual({
        name: 'test.pdf'
      });

      // Verify original metadata is preserved
      const metadata = indexService.getMetadata(messageId, 'test.pdf');
      expect(metadata).toEqual({
        messageId,
        filename: 'test.pdf',
        originalId: 'att123',
        mimeType: 'application/pdf',
        size: 1024,
        timestamp: expect.any(Number)
      });
    });

    it('should notify activity without error', () => {
      cleanupService.start();
      cleanupService.notifyActivity(); // Should not throw
      cleanupService.stop();
    });
  });
});

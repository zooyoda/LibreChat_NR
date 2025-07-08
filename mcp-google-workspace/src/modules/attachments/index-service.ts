/**
 * Service for managing attachment metadata and providing simplified references for AI interactions
 */

export interface AttachmentMetadataInternal {
  messageId: string;
  filename: string;
  originalId: string;
  mimeType: string;
  size: number;
  timestamp: number;
}

export class AttachmentIndexService {
  private static instance: AttachmentIndexService;
  private index: Map<string, AttachmentMetadataInternal>;
  private readonly _maxEntries: number = 256;
  private expiryMs: number = 3600000; // 1 hour

  /**
   * Get the maximum number of entries allowed in the index
   */
  get maxEntries(): number {
    return this._maxEntries;
  }

  private constructor() {
    this.index = new Map();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): AttachmentIndexService {
    if (!AttachmentIndexService.instance) {
      AttachmentIndexService.instance = new AttachmentIndexService();
    }
    return AttachmentIndexService.instance;
  }

  /**
   * Add or update attachment metadata in the index
   */
  addAttachment(messageId: string, attachment: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
  }): void {
    // Clean expired entries if we're near capacity
    if (this.index.size >= this._maxEntries) {
      this.cleanExpiredEntries();
      
      // If still at capacity after cleaning expired entries,
      // remove oldest entries until we have space
      if (this.index.size >= this._maxEntries) {
        const entries = Array.from(this.index.entries())
          .sort(([, a], [, b]) => a.timestamp - b.timestamp);
          
        while (this.index.size >= this._maxEntries && entries.length > 0) {
          const [key] = entries.shift()!;
          this.index.delete(key);
        }
      }
    }

    const key = `${messageId}_${attachment.name}`;
    this.index.set(key, {
      messageId,
      filename: attachment.name,
      originalId: attachment.id,
      mimeType: attachment.mimeType,
      size: attachment.size,
      timestamp: Date.now()
    });
  }

  /**
   * Retrieve attachment metadata by message ID and filename
   */
  getMetadata(messageId: string, filename: string): AttachmentMetadataInternal | undefined {
    const key = `${messageId}_${filename}`;
    const metadata = this.index.get(key);

    if (metadata && this.isExpired(metadata)) {
      this.index.delete(key);
      return undefined;
    }

    return metadata;
  }

  /**
   * Remove expired entries from the index
   */
  public cleanExpiredEntries(): void {
    const now = Date.now();
    for (const [key, metadata] of this.index.entries()) {
      if (this.isExpired(metadata)) {
        this.index.delete(key);
      }
    }
  }

  /**
   * Check if an entry has expired
   */
  private isExpired(metadata: AttachmentMetadataInternal): boolean {
    return Date.now() - metadata.timestamp > this.expiryMs;
  }

  /**
   * Get current number of entries in the index
   */
  get size(): number {
    return this.index.size;
  }
}

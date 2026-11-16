import { afterEach, describe, expect, it } from 'vitest';
import { assetOf, cloudinarySignature, cloudinaryUploadTarget, cloudinaryUrl, parseCloudinaryUrl } from './cloudinary';

describe('cloudinary', () => {
  afterEach(() => { delete process.env.CLOUDINARY_URL; });

  it('signs like the Cloudinary docs example', () => {
    const sig = cloudinarySignature({ timestamp: 1315060510, public_id: 'sample_image', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' }, 'abcd');
    expect(sig).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('reads the API environment variable', () => {
    expect(parseCloudinaryUrl('cloudinary://123456:abc-DEF_1@my-cloud')).toEqual({ cloud: 'my-cloud', key: '123456', secret: 'abc-DEF_1' });
    expect(parseCloudinaryUrl('https://x')).toBeNull();
    expect(parseCloudinaryUrl('')).toBeNull();
  });

  it('maps studio keys to Cloudinary assets', () => {
    expect(assetOf('videos/ab_c-1/video.MOV')).toEqual({ publicId: 'videos/ab_c-1/video', ext: 'mov', type: 'video' });
    expect(assetOf('videos/x/frame-1.jpg')).toEqual({ publicId: 'videos/x/frame-1', ext: 'jpg', type: 'image' });
  });

  it('builds upload forms and links', () => {
    process.env.CLOUDINARY_URL = 'cloudinary://111:shh@demo';
    const t = cloudinaryUploadTarget('videos/x/video.mp4');
    expect(t.url).toBe('https://api.cloudinary.com/v1_1/demo/video/upload');
    expect(t.fields).toMatchObject({ public_id: 'videos/x/video', api_key: '111' });
    expect(t.fields!.signature).toBe(cloudinarySignature({ public_id: 'videos/x/video', timestamp: t.fields!.timestamp }, 'shh'));
    expect(cloudinaryUrl('videos/x/video.mp4')).toBe('https://res.cloudinary.com/demo/video/upload/videos/x/video');
    expect(cloudinaryUrl('videos/x/thumb.jpg')).toBe('https://res.cloudinary.com/demo/image/upload/videos/x/thumb.jpg');
  });
});

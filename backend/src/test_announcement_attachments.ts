import { connectDatabase, disconnectDatabase, query, queryOne } from './config/database';
import { runMigrations } from './config/migrations';
import { announcementService, validateAndSaveImage } from './modules/announcements/announcement.service';
import fs from 'fs';
import path from 'path';

async function runAttachmentTests() {
  console.log('\n========================================================================');
  console.log('  🧪 STARTING ANNOUNCEMENT IMAGE ATTACHMENT TEST SUITE');
  console.log('========================================================================\n');

  await connectDatabase();
  await runMigrations();

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log('  ✅ [PASS] ' + testName);
      passed++;
    } else {
      console.error('  ❌ [FAIL] ' + testName);
      throw new Error('Test failed: ' + testName);
    }
  }

  const org1Id = 'test-org-001';
  const org2Id = 'test-org-002';
  const ownerUser = { id: 'owner-001', name: 'Hostel Owner', organizationId: org1Id };

  // Sample valid image data
  // Valid 1x1 JPEG buffer
  const sampleJpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]);
  const sampleJpgBase64 = 'data:image/jpeg;base64,' + sampleJpgBuffer.toString('base64');

  // Valid PNG buffer
  const samplePngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89]);
  const samplePngBase64 = 'data:image/png;base64,' + samplePngBuffer.toString('base64');

  // Valid WEBP buffer
  const sampleWebpBuffer = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x18, 0x00, 0x00, 0x00]),
    Buffer.from('WEBPVP8 ', 'ascii'),
    Buffer.from([0x0c, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00])
  ]);
  const sampleWebpBase64 = 'data:image/webp;base64,' + sampleWebpBuffer.toString('base64');

  console.log('[Test 1] Validating and saving JPG image...');
  const savedJpgUrl = validateAndSaveImage(sampleJpgBase64);
  assert(savedJpgUrl.startsWith('/uploads/announcements/') && savedJpgUrl.endsWith('.jpg'), 'Valid JPG saved with .jpg extension');

  console.log('[Test 2] Validating and saving PNG image...');
  const savedPngUrl = validateAndSaveImage(samplePngBase64);
  assert(savedPngUrl.startsWith('/uploads/announcements/') && savedPngUrl.endsWith('.png'), 'Valid PNG saved with .png extension');

  console.log('[Test 3] Validating and saving WEBP image...');
  const savedWebpUrl = validateAndSaveImage(sampleWebpBase64);
  assert(savedWebpUrl.startsWith('/uploads/announcements/') && savedWebpUrl.endsWith('.webp'), 'Valid WEBP saved with .webp extension');

  console.log('[Test 4] Rejecting invalid file types (e.g. plain text / invalid header)...');
  let rejectedInvalid = false;
  try {
    validateAndSaveImage('data:text/plain;base64,' + Buffer.from('Hello World').toString('base64'));
  } catch (err: any) {
    rejectedInvalid = true;
  }
  assert(rejectedInvalid, 'Invalid file format rejected with 400 error');

  console.log('[Test 5] Rejecting oversized image (> 5MB)...');
  let rejectedOversized = false;
  try {
    const hugeBuffer = Buffer.alloc(6 * 1024 * 1024, 0xff); // 6MB
    hugeBuffer[0] = 0xff; hugeBuffer[1] = 0xd8; hugeBuffer[2] = 0xff;
    validateAndSaveImage('data:image/jpeg;base64,' + hugeBuffer.toString('base64'));
  } catch (err: any) {
    rejectedOversized = true;
  }
  assert(rejectedOversized, 'Oversized image (>5MB) rejected with 400 limit error');

  console.log('[Test 6] Creating a Text-only announcement...');
  const textOnlyAnn = await announcementService.create({
    title: 'Text Notice: Hostel Gate Timings',
    message: 'Gate closes at 10:00 PM tonight for maintenance.',
    priority: 'NORMAL',
    targetType: 'ALL',
  }, ownerUser);
  assert(textOnlyAnn.title === 'Text Notice: Hostel Gate Timings' && !textOnlyAnn.imageUrl, 'Text-only announcement created without image');

  console.log('[Test 7] Creating an Image-only announcement (title + image)...');
  const imageOnlyAnn = await announcementService.create({
    title: 'Dinner Menu Poster',
    imageUrl: samplePngBase64,
    priority: 'NORMAL',
    targetType: 'ALL',
  }, ownerUser);
  assert(imageOnlyAnn.title === 'Dinner Menu Poster' && imageOnlyAnn.imageUrl && imageOnlyAnn.imageUrl.endsWith('.png'), 'Image-only announcement created with saved imageUrl');

  console.log('[Test 8] Creating a Text + Image announcement...');
  const textAndImageAnn = await announcementService.create({
    title: 'Cultural Festival 2026',
    message: 'Join us in the hostel courtyard this Sunday at 6 PM!',
    imageUrl: sampleJpgBase64,
    priority: 'IMPORTANT',
    targetType: 'ALL',
  }, ownerUser);
  assert(textAndImageAnn.title === 'Cultural Festival 2026' && textAndImageAnn.message.includes('courtyard') && textAndImageAnn.imageUrl.endsWith('.jpg'), 'Text + Image announcement created successfully');

  console.log('[Test 9] Student in Org 1 views announcements...');
  const studentOrg1 = { id: 'stu-user-001', studentId: 'stu-001', organizationId: org1Id };
  const student1List = await announcementService.getForStudent(studentOrg1);
  const foundFestival = student1List.find((a: any) => a.id === textAndImageAnn.id);
  assert(Boolean(foundFestival && foundFestival.imageUrl && foundFestival.imageUrl.endsWith('.jpg')), 'Student receives announcement with imageUrl');

  console.log('[Test 10] Multi-tenant isolation: Student in Org 2 cannot see Org 1 announcements...');
  const studentOrg2 = { id: 'stu-user-002', studentId: 'stu-002', organizationId: org2Id };
  const student2List = await announcementService.getForStudent(studentOrg2);
  const foundInOrg2 = student2List.find((a: any) => a.id === textAndImageAnn.id);
  assert(!foundInOrg2, 'Multi-tenant isolation verified: Student in Org 2 cannot see Org 1 announcements');

  console.log('[Test 11] Updating announcement: replacing image with WEBP...');
  const updatedAnn = await announcementService.update(textAndImageAnn.id, {
    imageUrl: sampleWebpBase64,
  }, org1Id);
  assert(updatedAnn.imageUrl.endsWith('.webp'), 'Announcement updated with new replaced image');

  console.log('[Test 12] Updating announcement: removing image (imageUrl = null)...');
  const removedImageAnn = await announcementService.update(textAndImageAnn.id, {
    imageUrl: null,
  }, org1Id);
  assert(removedImageAnn.imageUrl === null, 'Announcement image removed successfully');

  console.log('[Test 13] Safe deletion & cleanup of announcement with attachment...');
  const tempAnn = await announcementService.create({
    title: 'Temp Flash Notice',
    message: 'Will be deleted soon',
    imageUrl: sampleJpgBase64,
    targetType: 'ALL',
  }, ownerUser);
  const localFileName = path.basename(tempAnn.imageUrl);
  const diskPath = path.join(process.cwd(), 'uploads', 'announcements', localFileName);
  assert(fs.existsSync(diskPath), 'Image file written to local uploads directory');

  await announcementService.delete(tempAnn.id, org1Id);
  assert(!fs.existsSync(diskPath), 'Image file safely cleaned up from disk on delete');

  console.log('[Test 14] Student marking announcement as read and checking unread count...');
  await announcementService.markAsRead(imageOnlyAnn.id, studentOrg1.studentId);
  const updatedStudentList = await announcementService.getForStudent(studentOrg1);
  const readItem = updatedStudentList.find((a: any) => a.id === imageOnlyAnn.id);
  assert(readItem?.isRead === true, 'Announcement marked as read by student');

  console.log('\n========================================================================');
  console.log('  🎉 ALL ' + passed + '/' + total + ' ANNOUNCEMENT ATTACHMENT TESTS PASSED (100%)');
  console.log('========================================================================\n');

  await disconnectDatabase();
}

runAttachmentTests().catch((err) => {
  console.error('[Test Suite Error]:', err);
  process.exit(1);
});

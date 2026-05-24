/**
 * i18n - Translation system for 13 languages
 */
const translations = {
  en: {
    legal: { privacy: 'Privacy Policy', terms: 'User Agreement' },
    appName: 'Banner Generator', appDesc: 'Professional Animated Banners',
    nav: { home: 'Home', dashboard: 'Dashboard', toolsLabel: 'Tools', bannerConstructor: 'Banner Constructor', create: 'Create Banner', templates: 'Templates', history: 'History', saved: 'Saved Banners', stats: 'Statistics', batch: 'Batch Mode', logos: 'Logo Manager', analytics: 'Analytics', apiKeys: 'API Keys', projects: 'Our Projects', account: 'Account', help: 'Help', instructions: 'Instructions', growth: 'Growth & Referrals', socialKit: 'Social Media Kit', qrCode: 'QR Generator', imageTools: 'Image Tools', brandKit: 'Brand Kit', ogGenerator: 'OG-Image', mockup: 'Mockup Generator', abTest: 'A/B Test', shortener: 'URL Shortener', snapshare: 'SnapShare', promoPosts: 'Promo Posts', promoPostsAuto: 'Promo Posts Auto', donors: 'Top Donors', donate: 'Support Project', wpPlugin: 'WordPress Plugin' },
    dashboard: { title: 'Dashboard', loginRequired: 'Log in to access your dashboard', welcome: 'Welcome back', memberSince: 'Member since', totalBanners: 'Banners Created', totalLinks: 'Short Links', totalClicks: 'Total Clicks', referrals: 'Referrals', today: 'Today', active: 'Active', campaigns: 'Campaigns', weeklyActivity: 'Weekly Activity', allServices: 'All Services', recentActivity: 'Recent Activity', noActivity: 'No activity yet. Start creating!', bannersMade: 'created', linksCreated: 'links', testsRun: 'tests', logosUploaded: 'logos', referralsEarned: 'referrals', activeKeys: 'active', bannerGenerated: 'Banner generated', linkCreated: 'Link created' },
    bannerStats: { title: 'Banner Click Statistics', description: 'Track clicks and performance of your banners', filterAll: 'All Banners', filterWithClicks: 'Only with clicks', filterRecent: 'Recent 30 days', periodDay: 'Last 24 hours', periodWeek: 'Last 7 days', periodMonth: 'Last 30 days', periodAll: 'All time', totalClicks: 'Total Clicks', uniqueClicks: 'Unique Clicks', clicksLabel: 'Clicks', topReferrers: 'Top Referrers', empty: 'No click statistics yet' },
    stats: { title: 'Banner Click Statistics', description: 'Track clicks and performance of your banners', filterAll: 'All Banners', filterWithClicks: 'Only with clicks', filterRecent: 'Recent 30 days', periodDay: 'Last 24 hours', periodWeek: 'Last 7 days', periodMonth: 'Last 30 days', periodAll: 'All time', totalClicks: 'Total Clicks', uniqueClicks: 'Unique Clicks', clicksLabel: 'Clicks', topReferrers: 'Top Referrers', empty: 'No click statistics yet' },
    create: { title: 'Create Banner', simple: 'Simple', advanced: 'Advanced', text1: 'Text Line 1', text2: 'Text Line 2', text1ph: 'Enter headline...', text2ph: 'Enter subtext...', size: 'Banner Size', customSize: 'Custom:', format: 'Export Format', duration: 'Duration', fps: 'FPS', quality: 'Quality', qualityLow: 'Low (Fast, smaller file)', qualityMedium: 'Medium (Optimal)', qualityHigh: 'High (Better quality)', qualityUltra: 'Ultra (Best, slower) ⭐', qualityHint: 'Higher quality = better details, larger file size', generate: 'Generate Banner', generating: 'Generating...', background: 'Background', bgType: 'Type', bgColors: 'Colors', bgAngle: 'Angle', bgAnim: 'Animation', textSettings: 'Text Settings', fontSize: 'Font Size', fontFamily: 'Font', colors: 'Colors', bold: 'Bold', italic: 'Italic', shadow: 'Shadow', stroke: 'Stroke', animation: 'Animation', effects: 'Effects', particles: 'Particles', count: 'Count', particleSize: 'Size', speed: 'Speed', color: 'Color', glow: 'Glow', intensity: 'Intensity', position: 'Y Position', logo: 'Logo', logoSelect: 'Select Logo', logoNone: 'No Logo', logoOpacity: 'Opacity', logoSize: 'Size', bgImage: 'Background Image (optional)', bgImageHint: 'Click to upload or drag image here', bgImageFit: 'Fit Mode', bgImageOpacity: 'Opacity', fitCover: 'Cover (fill)', fitContain: 'Contain (fit)', fitStretch: 'Stretch', bgImageUploaded: 'Background image uploaded', linkUrl: 'Link URL (optional)', linkUrlHint: 'Banner will be clickable with this link', previewNote: 'ℹ️ Simplified preview. Final result will include particles, animations, quality enhancements & all effects.' },
    saved: { title: 'Saved Banners with Codes', description: 'All your generated banners with embed codes', empty: 'No saved banners yet' },
    embed: { title: 'Embed Code', description: 'Copy this code to embed the banner on your website', copy: 'Copy Code', copied: 'Code copied to clipboard!', getCode: 'Get Code' },
    templates: { title: 'Banner Templates', useTemplate: 'Use Template', all: 'All', casino: 'Casino', social: 'Social', ecommerce: 'E-Commerce', tech: 'Tech', food: 'Food', fitness: 'Fitness', realestate: 'Real Estate', travel: 'Travel', custom: 'My Templates', save: 'Save as Template' },
    history: { title: 'Generation History', empty: 'No banners generated yet', regenerate: 'Regenerate', delete: 'Delete', download: 'Download', size: 'Size', format: 'Format', date: 'Date', time: 'Processing Time' },
    batch: { title: 'Batch Generation', addRow: 'Add Banner', removeRow: 'Remove', generateAll: 'Generate All', progress: 'Progress', text: 'Text', completed: 'Completed', maxInfo: 'Maximum 20 banners per batch' },
    logos: { title: 'Logo Manager', upload: 'Upload Logo', formats: 'PNG, JPG, SVG, WebP (max 5MB)', empty: 'No logos uploaded', delete: 'Delete', select: 'Select for banner', loginRequired: 'Login required to manage logos', gateTitle: 'Log in to manage logos', gateSub: 'Upload your brand logo or watermark to add it to generated banners' },
    analytics: { title: 'Analytics', overview: 'Overview', totalGen: 'Total Generations', todayGen: 'Today', totalUsers: 'Total Users', genByDay: 'Generations by Day', popularSizes: 'Popular Sizes', peakHours: 'Peak Hours' },
    apiKeys: { title: 'API Keys', gateTitle: 'Log in to manage API Keys', gateSub: 'Generate API keys to integrate banner creation into your applications', create: 'Create New Key', name: 'Key Name', namePh: 'My integration...', rateLimit: 'Rate Limit (req/hour)', expiry: 'Expires in (days)', noExpiry: 'No expiry', created: 'Created', lastUsed: 'Last Used', active: 'Active', revoke: 'Revoke', newKeyWarning: 'Save this key! It will only be shown once.', loginRequired: 'Login required to manage API keys', docs: 'API Documentation', docsText: 'Use header X-API-Key with your key to authenticate API requests.' },
    account: { title: 'Account', login: 'Login', register: 'Register', email: 'Email', username: 'Username', password: 'Password', displayName: 'Display Name', language: 'Language', theme: 'Theme', light: 'Light', dark: 'Dark', save: 'Save', logout: 'Logout', profile: 'Profile', welcomeBack: 'Welcome back', verifyEmail: 'Confirm email', emailVerified: 'Verified', confirmCode: 'Confirm', resendCode: 'Resend', captcha: 'Captcha', forgotPassword: 'Forgot password?', restorePassword: 'Restore password', forgotHint: "Enter your email — we'll send a password reset link valid for 1 hour.", sendResetLink: 'Send reset link', newPassword: 'Set new password', confirmPassword: 'Confirm password', savePassword: 'Save new password', minChars: 'At least 8 characters', repeatPassword: 'Repeat password', resetSent: 'Reset link sent! Check your email.', passwordMismatch: 'Passwords do not match', passwordChanged: 'Password changed! Please log in.' },
    common: { loading: 'Loading...', error: 'Error', success: 'Success', cancel: 'Cancel', save: 'Save', delete: 'Delete', close: 'Close', download: 'Download', preview: 'Preview', noData: 'No data', loginRegister: 'Log In / Register' },
    progress: { generating: 'Generating your banner...', rendering: 'Rendering frames...', encoding: 'Encoding video...', optimizing: 'Optimizing output...', finalizing: 'Almost done...', done: 'Done!', complete: 'Banner created!', estimated: 'Estimated time:', hint: 'Larger banners and higher FPS take more time' },
    results: { ready: 'Banner is ready!', generateAnother: 'Generate Another', downloadAll: 'Download All' },
    projects: { title: 'Our Projects & Tools', subtitle: 'Explore our ecosystem of tools for content creation, automation, monetization and business growth', yourRefPage: 'Your Referral Page', refPageDesc: 'Share this link — visitors see all projects with YOUR referral links', referrals: 'Referrals:', refLinksTitle: 'My Referral Links', refLinksDesc: 'Add your referral links for each project. They will be shown on your public referral page.', attachLinks: 'Attach / Edit your referral links', attachLinksDesc: 'Insert your referral links for each project' },
    refStats: { title: 'Referral Statistics', allTime: 'All time', month: 'Month', today: 'Today' },
    growth: { loginRequired: 'Log in to access Growth tools', referrals: 'referrals', toNext: 'To', more: 'more', maxLevel: 'Maximum level reached!', levelsTitle: '🏆 Partner Levels', shareTitle: '🔗 Your Referral Links', shareSubtitle: 'Share these links to earn referrals and build your team', shareText: 'Check out this free banner generator!', postsTitle: '📝 Ready-made Posts', postsSubtitle: 'Copy and paste to social media, Telegram, groups', tabTelegram: 'Telegram', tabVK: 'VK', tabTwitter: 'Twitter/X', tabWhatsApp: 'WhatsApp', bannerKitTitle: '🎨 Promo Banner Kit', bannerKitSubtitle: 'Generate an advertising banner with your referral link to place on websites', utmTitle: '⚙️ UTM Link Builder', utmSubtitle: 'Track where your referrals come from', genBanner: 'Generate Banner', genBannerStart: 'Generating promo banner...', bannerReady: '✅ Banner downloaded!', teamTitle: '👥 Your Team', teamSubtitle: 'People who registered using your referral link', teamEmpty: 'No referrals yet. Share your link to build your team!', shareNow: 'Share now →', copy: 'Copy', copied: 'Copied!', build: 'Build', copyPost: '📋 Copy text', qrHint: 'Scan to open', colUser: 'User', colJoined: 'Joined', colBanners: 'Banners', colSource: 'Source', totalRefs: 'Total referrals', monthRefs: 'This month', todayRefs: 'Today', invite: 'Invite now', nudgeTitle: 'Grow your network!', nudgeText: 'Share your referral link and earn partner levels. Takes 30 seconds!', nudgeBtn: 'View Growth Tools →' },
    promo: { text: 'Earn with Traffic2Gift — Auto-monetization platform', cta: 'Try Free' },
    help: {
      title: 'Help Center', nav: 'Help', intro: 'Quick guide to all BannerGen features',
      sec1: 'Getting Started', sec2: 'Simple Mode', sec3: 'Advanced Mode', sec4: 'Templates',
      sec5: 'Batch Generation', sec6: 'Logo Manager', sec7: 'Statistics & Analytics',
      sec8: 'API Integration', sec9: 'Account & Security',
      tooltips: {
        text1: 'Your main headline. Keep it short and impactful — 2–5 words work best. Example: "HUGE SALE", "Play Now", "Join Free"',
        text2: 'Subtitle or call-to-action. Example: "Click here!", "50% OFF today", "Free trial". Leave empty to hide.',
        size: 'Choose a preset or enter custom dimensions below. Presets: 300×250 (rectangle), 728×90 (leaderboard), 160×600 (skyscraper), 320×50 (mobile). Advanced mode has 15 presets.',
        format: 'GIF — works everywhere (best compatibility). WebP — smaller file, modern browsers only. MP4 — for video ad platforms. You can select multiple formats at once.',
        duration: 'How long one animation loop plays. Options: 2s, 3s, 5s. For ads, 2–3 seconds work best. 5s for storytelling banners.',
        fps: 'Frames per second. 30 FPS = smooth animation, balanced file size. 60 FPS = ultra smooth, larger file (default). Lower FPS = faster generation.',
        quality: 'Low = smallest file, fastest generation. Medium = balanced quality. High = better quality. Ultra = maximum quality ⭐ (default).',
        bgType: 'Gradient: smooth transition between two colors — great for vibrant ads. Solid: flat single color — clean and simple.',
        bgAnim: 'Animate the background itself. "Static" = no animation. "Hue Rotate" smoothly shifts colors. "Pulse" makes it breathe rhythmically.',
        animation: 'How the text appears/moves. "Fade In" — smooth appear. "Bounce" — jumps in. "Glitch" — digital flicker. "Wave" — flowing motion. "Typewriter" — types letter by letter.',
        particles: 'Floating dots/sparkles around the text. Great for casino, gaming, or festive banners. Adjust count and size.',
        glow: 'Adds a glowing halo effect around the text. Makes text stand out on any background. Adjust intensity.',
        logo: 'Add your company logo to the banner. First upload a logo in the Logo Manager page (login required). Then select it here.',
        linkUrl: 'When someone clicks your banner, they go to this URL. Leave empty for a static (non-clickable) banner.',
        apiKey: 'Secret key to generate banners via the API from your code. Use the X-API-Key header. Rate limit: 100 requests/hour.',
        batch: 'Create up to 20 different banner variants at once. Each row = one banner. Great for A/B testing different texts and sizes.'
      }
    },
    instructions: {
      title: 'Instructions',
      kicker: 'Unified guide center',
      intro: 'Open any feature guide below to understand what it does, how to configure it, and where it fits in your workflow.',
      quickTitle: 'Quick start',
      quickSteps: '1. Pick the area you need: creative, marketing, analytics or community\\n2. Open the feature card and read what it does before configuring it\\n3. Follow the setup steps in order to avoid missing required inputs or authorization\\n4. Use the "Open feature" button to jump straight into the correct page',
      openFeature: 'Open feature',
      guideButton: 'Open guide',
      sections: {
        workspace: 'Workspace & growth',
        creative: 'Creative tools',
        marketing: 'Marketing & automation',
        analytics: 'Analytics & integrations',
        community: 'Community & support'
      },
      tooltips: {
        postLanguage: 'Chooses the language of generated post copy. Switch it to match the audience you publish to.',
        platform: 'Sets the main publishing platform. Share links and previews are prepared for this network first.',
        serviceFilter: 'Shows all promo services or narrows the workspace to one tool when you want a focused campaign pack.',
        shareVisible: 'Runs sharing for all currently visible cards. With a desktop agent it queues jobs; without it opens browser share windows.',
        copyVisible: 'Copies a combined campaign pack for the visible services so you can paste it into a planner, messenger or document.',
        refresh: 'Reloads tracked links, clicks and agent status from the server.',
        automationScope: 'Defines which platforms should be included in multi-platform automation and in the copied campaign pack.',
        agentStatus: 'Shows whether the desktop helper is connected and how many jobs are queued or running.',
        createToken: 'Generates a fresh token used to connect the desktop automation agent to your account.',
        sharePlatforms: 'Lets you trigger sharing for selected platforms without changing the main filter.',
        openTool: 'Opens the original tool connected to this promo service so you can update assets or landing pages.',
        shortLink: 'Tracked short URL with campaign parameters for this service and platform.'
      }
    },
    tools: {
      smk: { title: 'Social Media Kit', subtitle: 'Upload one image — get perfectly sized versions for every platform', guide_what: 'Upload one image and automatically get perfectly sized versions for every social media platform — Instagram, Facebook, Twitter/X, LinkedIn, Pinterest, TikTok, YouTube, Telegram, and more. Choose from 3 fit modes.', guide_steps: '1. Click the upload area or drag and drop your image\\n2. Choose fit mode: Cover (fill), Contain (fit), or Stretch\\n3. Select the platforms you need or click "Select All"\\n4. Click "Download All Selected" to get all sizes', guide_uses: 'Marketers launching campaigns across multiple social platforms\\nBloggers preparing images for different networks\\nBrands maintaining consistent visuals everywhere\\nAgencies delivering multi-platform creative assets', drop: 'Drop image here or click to browse', formats: 'PNG, JPG, WebP — any size', selectAll: 'Select All', fitCover: 'Fill (Cover)', fitContain: 'Fit (Contain)', fitStretch: 'Stretch', downloadAll: 'Download All Selected', change: 'Change' },
      qr: { title: 'QR Code Generator', subtitle: 'Create QR codes for links, text, Wi-Fi, contacts — instant download', guide_what: 'Generate QR codes for any purpose — URLs, plain text, Wi-Fi credentials, email addresses, phone numbers, and vCard contacts. Customize colors, size, and error correction level. Download as PNG instantly.', guide_steps: '1. Select the QR type (URL, Text, Wi-Fi, Email, Phone)\\n2. Enter the content for your QR code\\n3. Customize color, background, and size\\n4. Choose error correction level (7% to 30%)\\n5. Click "Generate" and download or copy the QR', guide_uses: 'Business cards with contact QR codes\\nRestaurant menus with Wi-Fi QR access\\nMarketing materials with trackable QR links\\nEvent tickets and check-in systems', url: 'URL', text: 'Text', wifi: 'Wi-Fi', email: 'Email', phone: 'Phone', ssid: 'Network Name (SSID)', password: 'Password', encryption: 'Encryption', subject: 'Subject', body: 'Body', phoneNumber: 'Phone Number', size: 'Size (px)', qrColor: 'QR Color', background: 'Background', errorLevel: 'Error Level', errLow: 'Low (7%)', errMed: 'Medium (15%)', errQuart: 'Quartile (25%)', errHigh: 'High (30%)', generate: 'Generate QR Code', placeholder: 'Your QR code will appear here', copy: 'Copy', enterContent: 'Enter content for QR code', copied: 'QR copied to clipboard!', failed: 'QR generation failed', copyFailed: 'Copy failed — try download instead' },
      it: { title: 'Image Tools', subtitle: 'Compress, resize, convert and analyze images — all in your browser', guide_what: 'All-in-one image toolkit: compress images to reduce file size, resize to exact pixels, convert between PNG/JPG/WebP, pick colors from images, crop regions, and generate favicons in 8 standard sizes.', guide_steps: '1. Choose a tool: Compress, Resize, Convert, Color Picker, Crop, or Favicon\\n2. Upload your image\\n3. Adjust settings (quality, dimensions, format)\\n4. Process and download the result', guide_uses: 'Optimizing images for faster website loading\\nResizing product photos for e-commerce\\nConverting image formats for compatibility\\nCreating website favicons from any image', compress: 'Compress', compressDesc: 'Reduce file size without visible quality loss', resize: 'Resize', resizeDesc: 'Change image dimensions to exact pixels', convert: 'Convert', convertDesc: 'PNG ↔ JPG ↔ WebP format conversion', colorPicker: 'Color Picker', colorPickerDesc: 'Extract colors from any image', crop: 'Crop', cropDesc: 'Crop image to exact region', favicon: 'Favicon Generator', faviconDesc: 'Create ICO favicons from any image', back: '← Back', upload: 'Upload an image', quality: 'Quality', width: 'Width', height: 'Height', lockRatio: 'Lock Ratio', convertTo: 'Convert to:', clickToPick: 'Click on the image to pick a color', dominantColors: 'Dominant Colors:', genFavicons: 'Generate All Favicons', faviconSizes: 'Favicon Sizes', uploadAnother: 'Upload Another', invalidDims: 'Invalid dimensions', compressed: 'Compressed', resized: 'Resized to', converted: 'Converted to' },
      bk: { title: 'Brand Kit', subtitle: 'Save your brand identity — colors, fonts, logos — for consistent banner creation', guide_what: 'Save your complete brand identity — up to 20 colors, 5 fonts, and logos. Apply your brand kit to the banner creator with one click. Export/import as JSON for backup. Includes 6 quick presets (Tech, Casino, E-commerce, Food, Fitness, Real Estate).', guide_steps: '1. Add your brand colors by clicking the color picker\\n2. Select brand fonts from the dropdown\\n3. Link your uploaded logos\\n4. Click "Apply to Banner Creator" to use your kit\\n5. Use "Copy Kit as JSON" to backup your brand', guide_uses: 'Maintaining consistent brand colors across all banners\\nQuickly applying brand identity to new designs\\nSharing brand guidelines with team members via JSON\\nTesting different brand palettes with presets', brandColors: 'Brand Colors', brandFonts: 'Brand Fonts', clickToSelect: 'Click to select / deselect', brandLogos: 'Brand Logos', logosLogin: 'Log in to use logos from your library.', logosEmpty: 'No logos yet. Go to', logosLink: 'Logo Manager', logosAdd: 'to add some.', logosFailed: 'Could not load logos.', quickPresets: 'Quick Presets', quickApply: 'Quick Apply', applyToBanner: 'Apply to Banner Creator', copyJson: 'Copy Kit as JSON', resetKit: 'Reset Kit', add: 'Add', maxColors: 'Maximum 20 colors', maxFonts: 'Max 5 fonts', alreadyInKit: 'Color already in kit', resetConfirm: 'Reset Brand Kit?', applied: 'Brand colors & font applied!', kitCopied: 'Brand Kit copied as JSON', kitReset: 'Brand Kit reset' },
      og: { title: 'OG-Image Generator', subtitle: 'Create perfect social media preview images — 1200×630', guide_what: 'Create beautiful 1200×630 Open Graph images for social media previews. When you share a link on Facebook, Twitter, Telegram, or LinkedIn, this image appears as the preview card. Add title, subtitle, logo, and custom background.', guide_steps: '1. Enter a title (max 80 characters) and subtitle\\n2. Choose background colors or upload a background image\\n3. Optionally add your logo and select its position\\n4. Preview the result in real-time\\n5. Download or copy the OG image', guide_uses: 'Creating eye-catching link previews for social media sharing\\nBlog post and article preview images\\nProduct page social cards for e-commerce\\nEvent and webinar promotional previews', titleLabel: 'Title (max 80 chars)', subtitleLabel: 'Subtitle (max 120 chars)', author: 'Author / Brand', bgColors: 'Background Colors', bgImage: 'Background Image', upload: 'Upload', noImage: 'No image', textColor: 'Text Color', font: 'Font', logoPos: 'Logo Position', posNone: 'None', posTopLeft: 'Top Left', posTopRight: 'Top Right', posBotLeft: 'Bottom Left', posBotRight: 'Bottom Right', uploadLogo: 'Upload Logo', noLogo: 'No logo', livePreview: 'Live Preview (1200×630)', copy: 'Copy', downloaded: 'Downloaded', copied: 'OG Image copied!', clipDenied: 'Clipboard denied' },
      mk: { title: 'Mockup Generator', subtitle: 'Place your design in realistic device frames', guide_what: 'Place your banner or screenshot into realistic device mockups — phones, tablets, laptops, and desktops. Customize frame color, drop shadow, corner radius, and background. Perfect for portfolio presentations.', guide_steps: '1. Select a device type (iPhone, iPad, MacBook, etc.)\\n2. Upload your design image\\n3. Adjust frame color, shadow, and corner radius\\n4. Customize the background color\\n5. Download the mockup image', guide_uses: 'Portfolio presentations showing your work in context\\nApp store screenshots and marketing materials\\nClient presentations with professional device frames\\nSocial media posts showcasing your designs', device: 'Device', uploadImage: 'Upload Image', uploadHint: 'Click or drag image here', settings: 'Settings', background: 'Background', frameColor: 'Frame Color', dropShadow: 'Drop Shadow', cornerRadius: 'Corner Radius', preview: 'Preview', uploadAnImage: 'Upload an image' },
      ab: { title: 'A/B Test Tracker', subtitle: 'Compare banner variants and find the winner', guide_what: 'Compare 2 to 4 banner variants side by side. Track impressions, clicks, and CTR for each variant. The system automatically determines the winner. Get tracking code to embed on your website.', guide_steps: '1. Click "Create New Test" and name your test\\n2. Add 2-4 banner variant names\\n3. Get the tracking code for each variant\\n4. Embed the code on your website\\n5. Monitor results — impressions, clicks, CTR\\n6. End the test when you have a clear winner', guide_uses: 'Testing different banner headlines for best CTR\\nComparing design variations before a campaign launch\\nData-driven decisions on which creative works best\\nOptimizing advertising spend with proven winners', loginRequired: 'Log in to create and manage A/B tests', loginBtn: 'Log In / Register', createNew: 'Create New Test', testName: 'Test Name', testNamePh: 'e.g. Homepage Banner Q1 2026', variants: 'Variants', addVariant: '+ Add Variant', createTest: 'Create Test', yourTests: 'Your Tests', noTests: 'No A/B tests yet. Create one above!', loading: 'Loading...', loadFailed: 'Failed to load tests', maxVariants: 'Max 4 variants', minVariants: 'Min 2 variants', created: 'A/B Test created!', failed: 'Failed', variant: 'Variant', impressions: 'Impressions', clicks: 'Clicks', ctr: 'CTR', bar: 'Bar', winner: 'Winner', active: 'Active', ended: 'Ended', endTest: 'End Test', trackingCode: 'Get Tracking Code', deleteTest: 'Delete', confirmEnd: 'End this test?', confirmDelete: 'Delete this test?', trackingTitle: 'Tracking Code', testEnded: 'Test ended', testDeleted: 'Test deleted', enterName: 'Enter test name', authRequired: 'Authentication Required' },
      shr: { title: 'URL Shortener', subtitle: 'Shorten, track, and manage your links', login_required: 'Please log in to use URL Shortener', guide_what: 'Professional URL shortener with full analytics. Shorten any link, create custom aliases, organize into campaigns, track clicks with detailed stats (devices, browsers, geo, referrers), generate QR codes, set smart redirect rules, create Bio pages, and protect links with passwords.', guide_steps: '1. Paste your long URL in the input field\\n2. Optionally set a custom alias, title, campaign, and tags\\n3. Click "Shorten" to create your short link\\n4. Copy, share, or generate a QR code for the link\\n5. Monitor performance in the Stats tab\\n6. Set up smart redirect rules for advanced targeting', guide_uses: 'Marketing campaigns — track which channels drive the most clicks\\nSocial media — share clean, branded short links\\nA/B testing — compare different landing pages with link rotation\\nBio pages — share all your links in one beautiful page', login: 'Log In', error: 'Error', retry: 'Retry', loading: 'Loading', load_error: 'Failed to load data', updated: 'Updated successfully', deleted: 'Deleted successfully', created: 'Created successfully', not_found: 'Not found', copied: 'Copied to clipboard!', exported: 'Export complete', no_data: 'No data available', paste_url: 'Paste your long URL here...', shorten: 'Shorten', custom_alias: 'Custom alias (optional)', no_campaign: 'No campaign', title_optional: 'Title (optional)', add_tags: 'Add tags (press Enter)', parameters: 'Parameters', format: 'Format', copy: 'Copy', qr_code: 'QR Code', enter_url: 'Please enter a valid URL', tabLinks: 'Links', tabCampaigns: 'Campaigns', tabDashboard: 'Dashboard', search: 'Search links...', all_campaigns: 'All Campaigns', all_tags: 'All Tags', newest: 'Newest', oldest: 'Oldest', most_clicks: 'Most Clicks', alphabetical: 'A-Z', no_links: 'No links yet. Create your first short link!', active: 'Active', inactive: 'Inactive', expired: 'Expired', clicks: 'clicks', stats: 'Stats', edit: 'Edit', clone: 'Clone', rules: 'Rules', delete: 'Delete', confirm_delete: 'Delete this link?', selected: 'selected', activate: 'Activate', deactivate: 'Deactivate', campaign: 'Campaign', tags: 'Tags', export_csv: 'Export CSV', compare: 'Compare', none_selected: 'No links selected', confirm_bulk_delete: 'Delete {n} selected links?', bulk_done: 'Bulk action completed', enter_campaign: 'Enter campaign name:', available: 'Available', campaign_not_found: 'Campaign not found', enter_tags_comma: 'Enter tags separated by commas:', just_now: 'just now', min_ago: 'min ago', hours_ago: 'h ago', days_ago: 'd ago', new_campaign: 'New Campaign', campaign_name: 'Campaign Name', campaign_description: 'Description (optional)', campaign_color: 'Color', campaign_links: 'links', campaign_clicks: 'clicks', save: 'Save', cancel: 'Cancel', edit_link: 'Edit Link', destination: 'Destination URL', status: 'Status', expiry: 'Expires (optional)', password: 'Password', optional: 'optional', leave_empty: 'Leave empty to remove password', stats_title: 'Link Statistics', total_clicks: 'Total Clicks', today_clicks: 'Today', unique: 'Unique Visitors', avg_per_day: 'Avg/Day', best_hour: 'Best Hour', best_day: 'Best Day', period_today: 'Today', period_7days: '7 Days', period_30days: '30 Days', period_all: 'All Time', bar_chart: 'Bar', line_chart: 'Line', heatmap_title: 'Click Heatmap', referrers: 'Referrers', devices: 'Devices', browsers: 'Browsers', operating_systems: 'OS', countries: 'Countries', languages: 'Languages', cities: 'Cities', direct: 'Direct', export_stats: 'Export Stats CSV', no_stats: 'No clicks recorded yet', compare_links: 'Compare Links', select_2_4: 'Select 2-4 links to compare', winner: 'Best', qr_title: 'QR Codes', qr_new: 'New QR Code', qr_label: 'Label', qr_label_ph: 'e.g. Flyer, Poster...', qr_style: 'Style', qr_fg: 'Foreground', qr_bg: 'Background', qr_create: 'Create QR', qr_download: 'Download PNG', qr_clicks: 'clicks via QR', qr_delete: 'Delete QR', qr_confirm_delete: 'Delete this QR code?', rules_title: 'Smart Redirect Rules', rules_loading: 'Loading rules...', no_rules: 'No redirect rules. All visitors go to the default destination.', add_rule: 'Add Rule', rule_type: 'Type', rule_value: 'Value', rule_dest: 'Destination URL', rule_priority: 'Priority', rule_device: 'Device', rule_browser: 'Browser', rule_os: 'Operating System', rule_language: 'Language', rule_country: 'Country', rule_rotation: 'URL Rotation', rotation_url: 'URL', rotation_weight: 'Weight', add_rotation_url: '+ Add URL', save_rules: 'Save Rules', rules_saved: 'Rules saved', max_rules: 'Maximum 20 rules', growth: 'Growth', active_links: 'Active Links', total_links_dash: 'Total Clicks', best_campaign: 'Best Campaign', trend_30d: '30-Day Trend', top_campaigns: 'Campaign Leaderboard', top_hours: 'Best Hours', top_days: 'Best Days', activity: 'Activity', days: 'days', less: 'Less', more: 'More', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun', preview_title: 'Preview', auto_fill: 'Auto-fill', paste_clipboard: 'Paste from clipboard', fetching_preview: 'Fetching preview...', og_section: 'Social Preview (OG Tags)', og_title: 'OG Title', og_description: 'OG Description', og_image: 'OG Image URL', og_preview: 'Social Card Preview', og_auto: 'Auto-filled from URL', pin: 'Pin', unpin: 'Unpin', pinned: 'Pinned', pinned_only: 'Pinned only', show_on_bio: 'Show on Bio', bio_page: 'Bio Page', bio_username: 'Username', bio_display_name: 'Display Name', bio_text: 'Bio', bio_avatar: 'Avatar URL', bio_theme: 'Theme Color', bio_background: 'Background', bio_public: 'Public', bio_save: 'Save Profile', bio_preview: 'Preview', bio_url: 'Your Bio URL', bio_no_profile: 'Create your Bio Page to share all links in one place', bio_saved: 'Bio profile saved!', bio_username_taken: 'Username is already taken', bg_gradient: 'Gradient', bg_solid: 'Solid', bg_dots: 'Dots', bg_waves: 'Waves', tabBio: 'Bio Page', confetti: 'Link created!', campaigns: 'Campaigns', url: 'URL', no_qr: 'No QR codes yet', generate_qr: 'Generate QR Code', default: 'Default', dots: 'Dots', rounded: 'Rounded', foreground: 'Foreground', background: 'Background', generate: 'Generate', download: 'Download', qr_generated: 'QR code generated!', cloned: 'Link cloned!', clone_error: 'Failed to clone link', bar: 'Bar', line: 'Line', links: 'Links', today: 'Today', close: 'Close', browser: 'Browser', os: 'OS', country: 'Country', device: 'Device', language: 'Language', priority: 'Priority', rotation: 'Rotation', weight: 'Weight', value: 'Value', unknown: 'Unknown', all_time: 'All Time', no_campaigns: 'No campaigns yet', campaign_created: 'Campaign created!', campaign_leaderboard: 'Campaign Leaderboard', click_heatmap: 'Click Heatmap', clicks_trend: 'Clicks Trend', create_error: 'Failed to create link', delete_error: 'Failed to delete', update_error: 'Failed to update', fill_all_fields: 'Please fill all required fields', growth_rate: 'Growth Rate', add_url: 'Add URL', rotation_help: 'Distribute traffic between multiple URLs', rule_deleted: 'Rule deleted' }
    },
    guideLabels: { what: 'What is this?', howTo: 'How to use', useCases: 'Use cases' },
    pageGuide: {
      create: { guide_what: 'Professional animated banner creator. Design eye-catching GIF, MP4, or WebP banners with 15+ standard ad sizes, 12 animation effects, particle systems, text styling, background images, and 4 quality levels. Simple mode for quick banners, Advanced mode for full control.', guide_steps: '1. Choose Simple or Advanced mode\\n2. Enter your headline and subtext\\n3. Select banner size and export format (GIF/MP4/WebP)\\n4. Customize colors, fonts, animations, and effects\\n5. Optionally add a logo and background image\\n6. Click "Generate" and download your banner', guide_uses: 'Website advertising banners for Google Ads, social media\\nPromo banners for e-commerce sales and discounts\\nSocial media animated posts and stories\\nEmail marketing headers and signatures' },
      templates: { guide_what: 'Pre-designed banner templates organized by industry. Choose from Casino, Social Media, E-Commerce, Tech, Food, Fitness, Real Estate, and Travel categories. One click loads all settings into the creator.', guide_steps: '1. Browse templates by category using the filter tabs\\n2. Preview each template to see the design\\n3. Click "Use Template" to load it into the banner creator\\n4. Customize text, colors, and effects to match your brand\\n5. Generate your personalized banner', guide_uses: 'Quick start when you need a banner fast\\nInspiration for your own custom designs\\nConsistent branding across campaigns' },
      history: { guide_what: 'View all your previously generated banners. Re-download files, regenerate with updated settings, or clean up old creations.', guide_steps: '1. Browse your generation history sorted by date\\n2. Click "Download" to save any previous banner\\n3. Click "Regenerate" to create a fresh version\\n4. Click "Delete" to remove unwanted items', guide_uses: 'Re-download banners you previously created\\nTrack your design iterations over time\\nRegenerate banners with improved settings' },
      saved: { guide_what: 'Store your best banners with ready-to-use embed codes. Copy HTML code to paste directly into any website, blog, or email template.', guide_steps: '1. After generating a banner, it appears in Saved\\n2. Click "Get Code" to see the embed HTML\\n3. Copy the code and paste it into your website\\n4. The banner will display with click tracking', guide_uses: 'Embedding banners on your website or blog\\nAdding animated banners to email campaigns\\nSharing banner code with clients or partners' },
      batch: { guide_what: 'Generate up to 20 banner variants at once. Perfect for A/B testing different headlines, sizes, or styles simultaneously. Save hours of manual work.', guide_steps: '1. Click "Add Banner" to create rows (up to 20)\\n2. Set different text, sizes, and formats for each\\n3. Click "Generate All" to process the entire batch\\n4. Download all results at once', guide_uses: 'A/B testing multiple headline variations\\nCreating banners in different sizes for one campaign\\nBulk production for advertising networks' },
      stats: { guide_what: 'Track real-time click statistics for your banners. See total clicks, unique visitors, top referrers, and filter by time period (24h, 7d, 30d, all time).', guide_steps: '1. Open Statistics to see all tracked banners\\n2. Filter by "With clicks only" or time period\\n3. Review total and unique click counts\\n4. Check top referrers to see where clicks come from', guide_uses: 'Measuring banner advertising effectiveness\\nIdentifying best-performing banner designs\\nOptimizing campaigns based on click data' },
      logos: { guide_what: 'Upload and organize your brand logos. Supports PNG, JPG, SVG, and WebP formats (up to 5MB). Logos can be added to any banner you create.', guide_steps: '1. Click "Upload Logo" and select your file\\n2. Manage your logo library (rename, favorite, tag)\\n3. When creating a banner, select a logo from the dropdown\\n4. Adjust logo size and opacity in the banner creator', guide_uses: 'Adding company logos to advertising banners\\nMaintaining a library of client logos\\nQuick access to brand assets while designing' },
      analytics: { guide_what: 'Platform-wide analytics dashboard. See total generations, active users, daily trends, most popular banner sizes, and peak usage hours.', guide_steps: '1. Open Analytics to see the overview dashboard\\n2. Review total generation count and daily trends\\n3. Check popular sizes to know what works best\\n4. Identify peak hours for your audience', guide_uses: 'Understanding platform usage patterns\\nPlanning content creation during peak hours\\nTracking growth of your banner production' },
      apiKeys: { guide_what: 'Create API keys for programmatic banner generation. Integrate BannerGen into your own apps, websites, or automation workflows using the REST API.', guide_steps: '1. Click "Create New Key" and enter a name\\n2. Set rate limit and optional expiry date\\n3. Copy the key immediately (shown only once!)\\n4. Use the X-API-Key header in your API requests', guide_uses: 'Automating banner generation from your CMS\\nBuilding white-label banner tools\\nIntegrating banner creation into marketing workflows' },
      growth: { guide_what: 'Referral program with partner levels (Newbie to Diamond). Share your unique link, track referrals, build your team, and access promotional tools including ready-made posts and UTM builder.', guide_steps: '1. Copy your unique referral link\\n2. Share it on social media, Telegram, or websites\\n3. Track new referrals in the Team section\\n4. Level up from Newbie to Diamond as you grow\\n5. Use the Promo Banner Kit to create ad banners', guide_uses: 'Earning partner levels through referrals\\nBuilding a team of active users\\nPromoting BannerGen on your channels' },
      dashboard: { guide_what: 'Personal workspace with your recent activity, banners, links, and referral progress in one view.', guide_steps: '1. Open the dashboard after login\\n2. Review totals for banners, links and clicks\\n3. Check recent activity and weekly movement\\n4. Jump into the next tool from here', guide_uses: 'Daily overview of your account\\nQuick access to active work\\nMonitoring progress without opening every tool separately' },
      projects: { guide_what: 'Catalog of the Arsenal ecosystem with referral-aware links and project descriptions.', guide_steps: '1. Open Projects to review all available products\\n2. Attach your own referral links where needed\\n3. Share the generated referral page or individual project links\\n4. Track referral growth from the linked tools', guide_uses: 'Exploring the full tool ecosystem\\nBuilding a referral landing page\\nSharing project links with monetization attached' },
      promoPosts: { guide_what: 'Manual promo publishing workspace that prepares tracked short links, ready-made post texts and browser share actions for each service.', guide_steps: '1. Select post language, platform and service filter\\n2. Review the generated copy and tracked short link for each service\\n3. Copy text or links, or share directly through browser share intents\\n4. Create an agent token if you plan to connect desktop automation later', guide_uses: 'Preparing promo posts without APIs\\nPublishing campaign copy manually with tracked links\\nKeeping referral and UTM attribution consistent' },
      promoPostsAuto: { guide_what: 'Advanced automation workspace for multi-platform promo sharing, desktop-helper queues, browser-extension control and one-click campaign packs.', guide_steps: '1. Set the post language, primary platform and optional service filter\\n2. Choose the automation scope by selecting one or more target platforms\\n3. Connect either the desktop helper or the browser extension with an agent token\\n4. Run automation for the visible set or queue a single service for the connected client\\n5. Copy the campaign pack whenever you need a manual fallback', guide_uses: 'Multi-platform promo distribution\\nDesktop-assisted or browser-native publishing flows\\nBuilding reusable campaign packs for teams or assistants' },
      wpPlugin: { guide_what: 'WordPress integration entry point for connecting Arsenal generation flows with a WordPress site.', guide_steps: '1. Open the plugin page and review installation requirements\\n2. Connect the plugin or copy the required integration details\\n3. Verify authentication and generation settings\\n4. Test banner or content delivery from WordPress', guide_uses: 'Connecting Arsenal to WordPress workflows\\nGenerating assets from a CMS\\nReducing manual handoff between site and toolkit' },
      donors: { guide_what: 'Public gratitude board with top supporters and contribution highlights.', guide_steps: '1. Open the donors page to review current supporters\\n2. Check rankings and recognition slots\\n3. Use it as a public trust and support signal', guide_uses: 'Showing community support\\nRecognizing contributors\\nAdding social proof to the project' },
      donate: { guide_what: 'Support page with donation options and contribution context for the project.', guide_steps: '1. Open the donation page\\n2. Choose a payment method or support tier\\n3. Complete the transfer and confirm the contribution\\n4. Return later to review supporter perks or recognition', guide_uses: 'Funding development\\nSupporting maintenance of the tools\\nUnlocking donor recognition or perks where available' }
    }
  },
  ru: {
    legal: { privacy: 'Политика конфиденциальности', terms: 'Пользовательское соглашение' },
    appName: 'Генератор Баннеров', appDesc: 'Профессиональные анимированные баннеры',
    nav: { home: 'Главная', dashboard: 'Панель управления', toolsLabel: 'Инструменты', bannerConstructor: 'Конструктор баннеров', create: 'Создать баннер', templates: 'Шаблоны', history: 'История', saved: 'Сохранённые', stats: 'Статистика', batch: 'Пакетный режим', logos: 'Логотипы', analytics: 'Аналитика', apiKeys: 'API-ключи', projects: 'Наши проекты', account: 'Аккаунт', help: 'Помощь', instructions: 'Инструкция', growth: 'Рост и рефералы', socialKit: 'Набор для соцсетей', qrCode: 'QR-генератор', imageTools: 'Инструменты', brandKit: 'Бренд-кит', ogGenerator: 'OG-изображения', mockup: 'Мокапы', abTest: 'A/B тесты', shortener: 'Сократитель ссылок', snapshare: 'SnapShare', promoPosts: 'Промо-посты', promoPostsAuto: 'Промо-посты Auto', donors: 'Топ донатов', donate: 'Поддержать проект', wpPlugin: 'WordPress плагин' , affiliate:'Партнёрка', leaderboard:'Лидерборд', adminMatrix:'Админ Матрица'},
    dashboard: { title: 'Панель управления', loginRequired: 'Войдите чтобы открыть панель управления', welcome: 'С возвращением', memberSince: 'Участник с', totalBanners: 'Баннеров создано', totalLinks: 'Коротких ссылок', totalClicks: 'Всего кликов', referrals: 'Рефералы', today: 'Сегодня', active: 'Активных', campaigns: 'Кампаний', weeklyActivity: 'Активность за неделю', allServices: 'Все сервисы', recentActivity: 'Последняя активность', noActivity: 'Пока нет активности. Начните создавать!', bannersMade: 'создано', linksCreated: 'ссылок', testsRun: 'тестов', logosUploaded: 'логотипов', referralsEarned: 'рефералов', activeKeys: 'активных', bannerGenerated: 'Баннер создан', linkCreated: 'Ссылка создана' },
    bannerStats: { title: 'Статистика кликов по баннерам', description: 'Отслеживайте клики и эффективность ваших баннеров', filterAll: 'Все баннеры', filterWithClicks: 'Только с кликами', filterRecent: 'За последние 30 дней', periodDay: 'Последние 24 часа', periodWeek: 'Последние 7 дней', periodMonth: 'Последние 30 дней', periodAll: 'Всё время', totalClicks: 'Всего кликов', uniqueClicks: 'Уникальных кликов', clicksLabel: 'Кликов', topReferrers: 'Топ источников', empty: 'Пока нет статистики кликов' },
    stats: { title: 'Статистика кликов по баннерам', description: 'Отслеживайте клики и эффективность ваших баннеров', filterAll: 'Все баннеры', filterWithClicks: 'Только с кликами', filterRecent: 'За последние 30 дней', periodDay: 'Последние 24 часа', periodWeek: 'Последние 7 дней', periodMonth: 'Последние 30 дней', periodAll: 'Всё время', totalClicks: 'Всего кликов', uniqueClicks: 'Уникальных кликов', clicksLabel: 'Кликов', topReferrers: 'Топ источников', empty: 'Пока нет статистики кликов' },
    create: { title: 'Создать баннер', simple: 'Простой', advanced: 'Расширенный', text1: 'Текст 1', text2: 'Текст 2', text1ph: 'Заголовок...', text2ph: 'Подзаголовок...', size: 'Размер баннера', customSize: 'Свой:', format: 'Формат экспорта', duration: 'Длительность', fps: 'FPS', quality: 'Качество', qualityLow: 'Низкое (Быстро, меньше размер)', qualityMedium: 'Среднее (Оптимально)', qualityHigh: 'Высокое (Лучше качество)', qualityUltra: 'Ультра (Максимум, медленно) ⭐', qualityHint: 'Высокое качество = лучше детали, больше размер файла', generate: 'Сгенерировать', generating: 'Генерация...', background: 'Фон', bgType: 'Тип', bgColors: 'Цвета', bgAngle: 'Угол', bgAnim: 'Анимация', textSettings: 'Настройки текста', fontSize: 'Размер', fontFamily: 'Шрифт', colors: 'Цвета', bold: 'Жирный', italic: 'Курсив', shadow: 'Тень', stroke: 'Обводка', animation: 'Анимация', effects: 'Эффекты', particles: 'Частицы', count: 'Количество', particleSize: 'Размер', speed: 'Скорость', color: 'Цвет', glow: 'Свечение', intensity: 'Интенсивность', position: 'Позиция Y', logo: 'Логотип', logoSelect: 'Выбрать логотип', logoNone: 'Без логотипа', logoOpacity: 'Прозрачность', logoSize: 'Размер', bgImage: 'Фоновое изображение (опционально)', bgImageHint: 'Нажмите для загрузки или перетащите изображение', bgImageFit: 'Режим заполнения', bgImageOpacity: 'Прозрачность', fitCover: 'Заполнить', fitContain: 'Вместить', fitStretch: 'Растянуть', bgImageUploaded: 'Фоновое изображение загружено', linkUrl: 'Ссылка (необязательно)', linkUrlHint: 'Баннер будет кликабельным с этой ссылкой', previewNote: 'ℹ️ Упрощённый предпросмотр. Финальный результат будет включать частицы, анимации, улучшения качества и все эффекты.' },
    saved: { title: 'Сохранённые баннеры с кодами', description: 'Все ваши сгенерированные баннеры с кодами для вставки', empty: 'Пока нет сохранённых баннеров' },
    embed: { title: 'Код для вставки', description: 'Скопируйте этот код для вставки баннера на ваш сайт', copy: 'Копировать код', copied: 'Код скопирован!', getCode: 'Получить код' },
    templates: { title: 'Шаблоны баннеров', useTemplate: 'Использовать', all: 'Все', casino: 'Казино', social: 'Соцсети', ecommerce: 'Магазины', tech: 'Технологии', food: 'Еда', fitness: 'Фитнес', realestate: 'Недвижимость', travel: 'Путешествия', custom: 'Мои шаблоны', save: 'Сохранить как шаблон' },
    history: { title: 'История генераций', empty: 'Баннеры ещё не создавались', regenerate: 'Повторить', delete: 'Удалить', download: 'Скачать', size: 'Размер', format: 'Формат', date: 'Дата', time: 'Время обработки' },
    batch: { title: 'Пакетная генерация', addRow: 'Добавить баннер', removeRow: 'Удалить', generateAll: 'Сгенерировать все', progress: 'Прогресс', text: 'Текст', completed: 'Завершено', maxInfo: 'Максимум 20 баннеров за раз' },
    logos: { title: 'Менеджер логотипов', upload: 'Загрузить логотип', formats: 'PNG, JPG, SVG, WebP (макс. 5МБ)', empty: 'Логотипы не загружены', delete: 'Удалить', select: 'Выбрать для баннера', loginRequired: 'Требуется авторизация' },
    analytics: { title: 'Аналитика', overview: 'Обзор', totalGen: 'Всего генераций', todayGen: 'Сегодня', totalUsers: 'Пользователей', genByDay: 'Генерации по дням', popularSizes: 'Популярные размеры', peakHours: 'Пиковые часы' },
    apiKeys: { title: 'API-ключи', create: 'Создать ключ', name: 'Название', namePh: 'Моя интеграция...', rateLimit: 'Лимит (запр/час)', expiry: 'Срок действия (дней)', noExpiry: 'Бессрочно', created: 'Создан', lastUsed: 'Последнее использование', active: 'Активен', revoke: 'Отозвать', newKeyWarning: 'Сохраните ключ! Он показывается только один раз.', loginRequired: 'Требуется авторизация', docs: 'Документация API', docsText: 'Используйте заголовок X-API-Key с вашим ключом для аутентификации API-запросов.' },
    account: { title: 'Аккаунт', login: 'Войти', register: 'Регистрация', email: 'Email', username: 'Имя пользователя', password: 'Пароль', displayName: 'Отображаемое имя', language: 'Язык', theme: 'Тема', light: 'Светлая', dark: 'Тёмная', save: 'Сохранить', logout: 'Выйти', profile: 'Профиль', welcomeBack: 'С возвращением', verifyEmail: 'Подтвердить почту', emailVerified: 'Подтверждён', confirmCode: 'Подтвердить', resendCode: 'Отправить снова', captcha: 'Капча', forgotPassword: 'Забыли пароль?', restorePassword: 'Восстановление пароля', forgotHint: 'Введите email — мы отправим ссылку для сброса пароля (действует 1 час).', sendResetLink: 'Отправить ссылку', newPassword: 'Новый пароль', confirmPassword: 'Подтвердите пароль', savePassword: 'Сохранить пароль', minChars: 'Минимум 8 символов', repeatPassword: 'Повторите пароль', resetSent: 'Ссылка отправлена! Проверьте почту.', passwordMismatch: 'Пароли не совпадают', passwordChanged: 'Пароль изменён! Войдите.' },
    common: { loading: 'Загрузка...', error: 'Ошибка', success: 'Успешно', cancel: 'Отмена', save: 'Сохранить', delete: 'Удалить', close: 'Закрыть', download: 'Скачать', preview: 'Предпросмотр', noData: 'Нет данных', loginRegister: 'Войти / Зарегистрироваться' },
    progress: { generating: 'Генерация баннера...', rendering: 'Рендеринг кадров...', encoding: 'Кодирование видео...', optimizing: 'Оптимизация...', finalizing: 'Почти готово...', done: 'Готово!', complete: 'Баннер создан!', estimated: 'Примерное время:', hint: 'Большие баннеры и высокий FPS требуют больше времени' },
    results: { ready: 'Баннер готов!', generateAnother: 'Создать ещё', downloadAll: 'Скачать все' },
    projects: { title: 'Наши проекты и инструменты', subtitle: 'Экосистема инструментов для создания контента, автоматизации, монетизации и роста бизнеса', yourRefPage: 'Ваша реферальная страница', refPageDesc: 'Поделитесь ссылкой — посетители увидят все проекты с ВАШИМИ реферальными ссылками', referrals: 'Рефералы:', refLinksTitle: 'Мои реферальные ссылки', refLinksDesc: 'Добавьте свои реферальные ссылки для каждого проекта. Они будут показаны на вашей публичной реферальной странице.', attachLinks: 'Привязать / Изменить реферальные ссылки', attachLinksDesc: 'Вставьте реферальные ссылки для каждого проекта' },
    refStats: { title: 'Статистика рефералов', allTime: 'Всё время', month: 'Месяц', today: 'Сегодня' },
    growth: { loginRequired: 'Войдите чтобы открыть инструменты роста', referrals: 'рефералов', toNext: 'До', more: 'ещё', maxLevel: 'Максимальный уровень достигнут!', levelsTitle: '🏆 Уровни партнёра', shareTitle: '🔗 Ваши реферальные ссылки', shareSubtitle: 'Делитесь этими ссылками чтобы привлекать рефералов и строить команду', shareText: 'Посмотри этот бесплатный генератор баннеров!', postsTitle: '📝 Готовые посты', postsSubtitle: 'Копируйте и вставляйте в соцсети, Telegram, группы', tabTelegram: 'Telegram', tabVK: 'ВКонтакте', tabTwitter: 'Twitter/X', tabWhatsApp: 'WhatsApp', bannerKitTitle: '🎨 Набор рекламных баннеров', bannerKitSubtitle: 'Сгенерируйте рекламный баннер с вашей реферальной ссылкой для размещения на сайтах', utmTitle: '⚙️ UTM-конструктор', utmSubtitle: 'Отслеживайте откуда приходят ваши рефералы', genBanner: 'Сгенерировать баннер', genBannerStart: 'Создаю рекламный баннер...', bannerReady: '✅ Баннер скачан!', teamTitle: '👥 Ваша команда', teamSubtitle: 'Пользователи, зарегистрировавшиеся по вашей реферальной ссылке', teamEmpty: 'Пока нет рефералов. Поделитесь ссылкой чтобы строить команду!', shareNow: 'Поделиться →', copy: 'Копировать', copied: 'Скопировано!', build: 'Собрать', copyPost: '📋 Копировать текст', qrHint: 'Сканируйте для открытия', colUser: 'Пользователь', colJoined: 'Регистрация', colBanners: 'Баннеров', colSource: 'Источник', totalRefs: 'Всего рефералов', monthRefs: 'В этом месяце', todayRefs: 'Сегодня', invite: 'Пригласить', nudgeTitle: 'Развивайте сеть!', nudgeText: 'Поделитесь реферальной ссылкой и зарабатывайте партнёрские уровни. Займёт 30 секунд!', nudgeBtn: 'Инструменты роста →' },
    promo: { text: 'Traffic2Gift — Автомонетизация трафика', cta: 'Попробовать' },
    help: {
      title: 'Центр помощи', nav: 'Помощь', intro: 'Быстрый гид по всем функциям BannerGen',
      sec1: 'Начало работы', sec2: 'Простой режим', sec3: 'Расширенный режим', sec4: 'Шаблоны',
      sec5: 'Пакетный режим', sec6: 'Менеджер логотипов', sec7: 'Статистика и аналитика',
      sec8: 'API интеграция', sec9: 'Аккаунт и безопасность',
      tooltips: {
        text1: 'Ваш главный заголовок. Держите его коротким и ёмким — 2–5 слов идеально. Пример: "МЕГА СКИДКА", "Играй сейчас", "Вступай бесплатно"',
        text2: 'Подзаголовок или призыв к действию. Пример: "Нажмите здесь!", "Скидка 50% сегодня", "Бесплатный пробный период". Оставьте пустым, чтобы скрыть.',
        size: 'Выберите готовый размер или введите свой ниже. Стандарты: 300×250 (прямоугольник), 728×90 (горизонтальный), 160×600 (вертикальный), 320×50 (мобильный). В расширенном режиме — 15 вариантов.',
        format: 'GIF — работает везде (лучшая совместимость). WebP — меньше файл, только современные браузеры. MP4 — для видеорекламы. Можно выбрать несколько форматов.',
        duration: 'Длина одного цикла анимации. Варианты: 2с, 3с, 5с. Для рекламы оптимально 2–3 секунды. 5с — для сторителлинга.',
        fps: 'Кадров в секунду. 30 FPS = плавная анимация, сбалансированный размер. 60 FPS = максимально плавно, больше файл (по умолчанию). Меньше FPS = быстрее генерация.',
        quality: 'Низкое = минимальный файл, быстрее. Среднее = баланс качества. Высокое = лучше качество. Ультра = максимум ⭐ (по умолчанию).',
        bgType: 'Градиент: плавный переход между двумя цветами — отлично для ярких баннеров. Заливка: плоский однотонный цвет — чисто и просто.',
        bgAnim: 'Анимировать сам фон. "Статика" — без анимации. "Смена оттенка" — плавно меняет цвета. "Пульс" — фон ритмично "дышит".',
        animation: 'Как текст появляется/движется. "Fade In" — плавное появление. "Bounce" — прыгает. "Glitch" — мерцает. "Wave" — волна. "Typewriter" — печатается посимвольно.',
        particles: 'Плавающие точки/искры вокруг текста. Отлично для казино, игровых и праздничных баннеров. Регулируйте количество и размер.',
        glow: 'Добавляет светящийся ореол вокруг текста. Делает текст заметным на любом фоне. Регулируйте интенсивность.',
        logo: 'Добавьте логотип компании на баннер. Сначала загрузите логотип в разделе "Логотипы" (нужна авторизация). Затем выберите его здесь.',
        linkUrl: 'Куда перейдёт пользователь при клике на баннер. Оставьте пустым для статичного (некликабельного) баннера.',
        apiKey: 'Секретный ключ для генерации баннеров через API из вашего кода. Используйте заголовок X-API-Key. Лимит: 100 запросов/час.',
        batch: 'Создайте до 20 разных вариантов баннеров за один раз. Каждая строка = отдельный баннер. Идеально для A/B тестирования текстов и размеров.'
      }
    },
    tools: {
      smk: { title: 'Набор для соцсетей', subtitle: 'Загрузите одно изображение — получите идеальные размеры для каждой платформы', guide_what: 'Загрузите одно изображение и автоматически получите идеально подогнанные версии для всех соцсетей — Instagram, Facebook, Twitter/X, LinkedIn, Pinterest, TikTok, YouTube, Telegram и других. 3 режима подгонки.', guide_steps: '1. Нажмите на область загрузки или перетащите изображение\\n2. Выберите режим: Заполнить, Вместить или Растянуть\\n3. Отметьте нужные платформы или "Выбрать все"\\n4. Нажмите "Скачать все" для загрузки', guide_uses: 'Маркетологи, запускающие кампании на нескольких платформах\\nБлогеры, подготавливающие изображения для разных сетей\\nБренды, поддерживающие единый визуальный стиль\\nАгентства, создающие креативы для клиентов', drop: 'Перетащите изображение или нажмите для выбора', formats: 'PNG, JPG, WebP — любой размер', selectAll: 'Выбрать все', fitCover: 'Заполнить', fitContain: 'Вместить', fitStretch: 'Растянуть', downloadAll: 'Скачать все выбранные', change: 'Изменить' },
      qr: { title: 'Генератор QR-кодов', subtitle: 'Создавайте QR-коды для ссылок, текста, Wi-Fi, контактов — мгновенная загрузка', guide_what: 'Генерируйте QR-коды для любых целей — ссылки, текст, Wi-Fi, email, телефон, контакты vCard. Настраивайте цвета, размер и уровень коррекции ошибок. Мгновенная загрузка в PNG.', guide_steps: '1. Выберите тип QR (Ссылка, Текст, Wi-Fi, Email, Телефон)\\n2. Введите содержимое для QR-кода\\n3. Настройте цвет, фон и размер\\n4. Выберите уровень коррекции (от 7% до 30%)\\n5. Нажмите "Создать" и скачайте или скопируйте QR', guide_uses: 'Визитки с QR-кодом контактов\\nМеню ресторанов с QR для Wi-Fi\\nРекламные материалы с отслеживаемыми QR-ссылками\\nБилеты на мероприятия и системы регистрации', url: 'Ссылка', text: 'Текст', wifi: 'Wi-Fi', email: 'Email', phone: 'Телефон', ssid: 'Имя сети (SSID)', password: 'Пароль', encryption: 'Шифрование', subject: 'Тема', body: 'Текст письма', phoneNumber: 'Номер телефона', size: 'Размер (px)', qrColor: 'Цвет QR', background: 'Фон', errorLevel: 'Уровень коррекции', errLow: 'Низкий (7%)', errMed: 'Средний (15%)', errQuart: 'Четверть (25%)', errHigh: 'Высокий (30%)', generate: 'Создать QR-код', placeholder: 'Ваш QR-код появится здесь', copy: 'Копировать', enterContent: 'Введите содержимое для QR-кода', copied: 'QR скопирован в буфер!', failed: 'Ошибка генерации QR', copyFailed: 'Ошибка копирования — попробуйте скачать' },
      it: { title: 'Инструменты для изображений', subtitle: 'Сжимайте, изменяйте размер, конвертируйте и анализируйте — прямо в браузере', guide_what: 'Полный набор инструментов: сжатие для уменьшения размера, изменение размеров до точных пикселей, конвертация PNG/JPG/WebP, пипетка цветов, обрезка и генератор фавиконов в 8 стандартных размерах.', guide_steps: '1. Выберите инструмент: Сжать, Размер, Конвертировать, Пипетка, Обрезка или Favicon\\n2. Загрузите изображение\\n3. Настройте параметры (качество, размеры, формат)\\n4. Обработайте и скачайте результат', guide_uses: 'Оптимизация изображений для быстрой загрузки сайта\\nИзменение размеров фото товаров для интернет-магазинов\\nКонвертация форматов для совместимости\\nСоздание фавиконов для сайтов', compress: 'Сжать', compressDesc: 'Уменьшить размер без видимой потери качества', resize: 'Размер', resizeDesc: 'Изменить размеры изображения до точных пикселей', convert: 'Конвертировать', convertDesc: 'Конвертация PNG ↔ JPG ↔ WebP', colorPicker: 'Пипетка', colorPickerDesc: 'Извлечь цвета из изображения', crop: 'Обрезка', cropDesc: 'Обрезать изображение по области', favicon: 'Генератор Favicon', faviconDesc: 'Создать ICO фавиконы из изображения', back: '← Назад', upload: 'Загрузить изображение', quality: 'Качество', width: 'Ширина', height: 'Высота', lockRatio: 'Сохранять пропорции', convertTo: 'Конвертировать в:', clickToPick: 'Нажмите на изображение чтобы выбрать цвет', dominantColors: 'Основные цвета:', genFavicons: 'Создать все фавиконы', faviconSizes: 'Размеры фавиконов', uploadAnother: 'Загрузить другое', invalidDims: 'Неверные размеры', compressed: 'Сжато', resized: 'Размер изменён на', converted: 'Конвертировано в' },
      bk: { title: 'Бренд-кит', subtitle: 'Сохраните фирменный стиль — цвета, шрифты, логотипы — для единообразных баннеров', guide_what: 'Сохраните фирменный стиль — до 20 цветов, 5 шрифтов и логотипы. Применяйте бренд-кит к созданию баннеров одним нажатием. Экспорт/импорт в JSON. 6 готовых пресетов (Технологии, Казино, Магазины, Еда, Фитнес, Недвижимость).', guide_steps: '1. Добавьте цвета бренда через палитру\\n2. Выберите шрифты из списка\\n3. Привяжите загруженные логотипы\\n4. Нажмите "Применить к баннеру" для использования\\n5. "Копировать как JSON" для резервной копии', guide_uses: 'Единообразие цветов бренда во всех баннерах\\nБыстрое применение фирменного стиля к новым дизайнам\\nОбмен гайдлайнами с командой через JSON\\nТестирование разных палитр с помощью пресетов', brandColors: 'Цвета бренда', brandFonts: 'Шрифты бренда', clickToSelect: 'Нажмите для выбора / отмены', brandLogos: 'Логотипы бренда', logosLogin: 'Войдите, чтобы использовать логотипы.', logosEmpty: 'Логотипов нет. Перейдите в', logosLink: 'Менеджер логотипов', logosAdd: 'чтобы добавить.', logosFailed: 'Не удалось загрузить логотипы.', quickPresets: 'Быстрые пресеты', quickApply: 'Быстрое применение', applyToBanner: 'Применить к созданию баннера', copyJson: 'Копировать как JSON', resetKit: 'Сбросить кит', add: 'Добавить', maxColors: 'Максимум 20 цветов', maxFonts: 'Максимум 5 шрифтов', alreadyInKit: 'Цвет уже в ките', resetConfirm: 'Сбросить бренд-кит?', applied: 'Цвета и шрифт применены!', kitCopied: 'Бренд-кит скопирован как JSON', kitReset: 'Бренд-кит сброшен' },
      og: { title: 'Генератор OG-изображений', subtitle: 'Создавайте идеальные превью для соцсетей — 1200×630', guide_what: 'Создавайте красивые OG-изображения 1200×630 для превью в соцсетях. Когда вы делитесь ссылкой в Facebook, Twitter, Telegram или LinkedIn — это изображение отображается как превью. Добавляйте заголовок, подзаголовок, логотип и фон.', guide_steps: '1. Введите заголовок (макс. 80 символов) и подзаголовок\\n2. Выберите цвета фона или загрузите изображение\\n3. Добавьте логотип и выберите его позицию\\n4. Просмотрите результат в реальном времени\\n5. Скачайте или скопируйте OG-изображение', guide_uses: 'Привлекательные превью при шеринге ссылок в соцсетях\\nОбложки статей и блог-постов\\nКарточки товаров для соцсетей\\nПревью мероприятий и вебинаров', titleLabel: 'Заголовок (макс. 80 символов)', subtitleLabel: 'Подзаголовок (макс. 120 символов)', author: 'Автор / Бренд', bgColors: 'Цвета фона', bgImage: 'Фоновое изображение', upload: 'Загрузить', noImage: 'Нет изображения', textColor: 'Цвет текста', font: 'Шрифт', logoPos: 'Позиция логотипа', posNone: 'Нет', posTopLeft: 'Сверху слева', posTopRight: 'Сверху справа', posBotLeft: 'Снизу слева', posBotRight: 'Снизу справа', uploadLogo: 'Загрузить логотип', noLogo: 'Нет логотипа', livePreview: 'Предпросмотр (1200×630)', copy: 'Копировать', downloaded: 'Скачано', copied: 'OG-изображение скопировано!', clipDenied: 'Доступ к буферу запрещён' },
      mk: { title: 'Генератор мокапов', subtitle: 'Разместите дизайн в реалистичных рамках устройств', guide_what: 'Поместите баннер или скриншот в реалистичные мокапы устройств — телефоны, планшеты, ноутбуки. Настраивайте цвет рамки, тень, скругление углов и фон. Идеально для портфолио и презентаций.', guide_steps: '1. Выберите тип устройства (iPhone, iPad, MacBook и др.)\\n2. Загрузите изображение дизайна\\n3. Настройте цвет рамки, тень и скругление\\n4. Выберите цвет фона\\n5. Скачайте готовый мокап', guide_uses: 'Презентации портфолио с дизайнами в контексте\\nСкриншоты для магазинов приложений\\nКлиентские презентации в профессиональных рамках\\nПосты в соцсетях с демонстрацией дизайнов', device: 'Устройство', uploadImage: 'Загрузить изображение', uploadHint: 'Нажмите или перетащите изображение', settings: 'Настройки', background: 'Фон', frameColor: 'Цвет рамки', dropShadow: 'Тень', cornerRadius: 'Скругление углов', preview: 'Предпросмотр', uploadAnImage: 'Загрузите изображение' },
      ab: { title: 'A/B Тест-трекер', subtitle: 'Сравнивайте варианты баннеров и находите лучший', guide_what: 'Сравнивайте от 2 до 4 вариантов баннеров. Отслеживайте показы, клики и CTR каждого варианта. Система автоматически определяет победителя. Получите код отслеживания для встраивания на сайт.', guide_steps: '1. Нажмите "Создать новый тест" и дайте ему название\\n2. Добавьте 2-4 варианта баннеров\\n3. Получите код отслеживания для каждого варианта\\n4. Встройте код на ваш сайт\\n5. Отслеживайте результаты — показы, клики, CTR\\n6. Завершите тест, когда определится победитель', guide_uses: 'Тестирование разных заголовков для лучшего CTR\\nСравнение вариантов дизайна перед запуском кампании\\nПринятие решений на основе данных\\nОптимизация рекламных расходов с проверенными креативами', loginRequired: 'Войдите для создания и управления A/B тестами', loginBtn: 'Войти / Регистрация', createNew: 'Создать новый тест', testName: 'Название теста', testNamePh: 'напр. Баннер на главной Q1 2026', variants: 'Варианты', addVariant: '+ Добавить вариант', createTest: 'Создать тест', yourTests: 'Ваши тесты', noTests: 'A/B тестов пока нет. Создайте выше!', loading: 'Загрузка...', loadFailed: 'Не удалось загрузить тесты', maxVariants: 'Максимум 4 варианта', minVariants: 'Минимум 2 варианта', created: 'A/B тест создан!', failed: 'Ошибка', variant: 'Вариант', impressions: 'Показы', clicks: 'Клики', ctr: 'CTR', bar: 'Бар', winner: 'Победитель', active: 'Активен', ended: 'Завершён', endTest: 'Завершить тест', trackingCode: 'Код отслеживания', deleteTest: 'Удалить', confirmEnd: 'Завершить этот тест?', confirmDelete: 'Удалить этот тест?', trackingTitle: 'Код отслеживания', testEnded: 'Тест завершён', testDeleted: 'Тест удалён', enterName: 'Введите название теста', authRequired: 'Требуется авторизация' },
      shr: { title: 'Сократитель ссылок', subtitle: 'Сокращайте, отслеживайте и управляйте ссылками', guide_what: 'Профессиональный сократитель с полной аналитикой. Сокращайте ссылки, алиасы, кампании, статистика кликов, QR-коды, умные правила, Bio-страницы и пароли.', guide_steps: '1. Вставьте ссылку\\n2. Задайте алиас и кампанию\\n3. Нажмите "Сократить"\\n4. Создайте QR-код\\n5. Смотрите статистику\\n6. Настройте правила', guide_uses: 'Маркетинговые кампании\\nСоцсети\\nA/B тестирование\\nBio-страницы', login_required: 'Войдите, чтобы использовать сократитель ссылок', login: 'Войти', error: 'Ошибка', retry: 'Повторить', loading: 'Загрузка', load_error: 'Не удалось загрузить данные', updated: 'Успешно обновлено', deleted: 'Успешно удалено', created: 'Успешно создано', not_found: 'Не найдено', copied: 'Скопировано в буфер обмена!', exported: 'Экспорт завершён', no_data: 'Нет данных', paste_url: 'Вставьте длинную ссылку...', shorten: 'Сократить', custom_alias: 'Свой алиас (необязательно)', no_campaign: 'Без кампании', title_optional: 'Название (необязательно)', add_tags: 'Добавить теги (Enter)', parameters: 'Параметры', format: 'Формат', copy: 'Копировать', qr_code: 'QR-код', enter_url: 'Введите корректный URL', tabLinks: 'Ссылки', tabCampaigns: 'Кампании', tabDashboard: 'Дашборд', search: 'Поиск ссылок...', all_campaigns: 'Все кампании', all_tags: 'Все теги', newest: 'Новые', oldest: 'Старые', most_clicks: 'По кликам', alphabetical: 'А-Я', no_links: 'Ссылок пока нет. Создайте первую!', active: 'Активна', inactive: 'Неактивна', expired: 'Истекла', clicks: 'кликов', stats: 'Стат.', edit: 'Редактировать', clone: 'Клонировать', rules: 'Правила', delete: 'Удалить', confirm_delete: 'Удалить эту ссылку?', selected: 'выбрано', activate: 'Активировать', deactivate: 'Деактивировать', campaign: 'Кампания', tags: 'Теги', export_csv: 'Экспорт CSV', compare: 'Сравнить', none_selected: 'Ссылки не выбраны', confirm_bulk_delete: 'Удалить {n} выбранных ссылок?', bulk_done: 'Массовое действие выполнено', enter_campaign: 'Введите название кампании:', available: 'Доступно', campaign_not_found: 'Кампания не найдена', enter_tags_comma: 'Введите теги через запятую:', just_now: 'только что', min_ago: 'мин назад', hours_ago: 'ч назад', days_ago: 'д назад', new_campaign: 'Новая кампания', campaign_name: 'Название кампании', campaign_description: 'Описание (необязательно)', campaign_color: 'Цвет', campaign_links: 'ссылок', campaign_clicks: 'кликов', save: 'Сохранить', cancel: 'Отмена', edit_link: 'Редактирование ссылки', destination: 'Целевой URL', status: 'Статус', expiry: 'Истекает (необязательно)', password: 'Пароль', optional: 'необязательно', leave_empty: 'Оставьте пустым для удаления пароля', stats_title: 'Статистика ссылки', total_clicks: 'Всего кликов', today_clicks: 'Сегодня', unique: 'Уникальные посетители', avg_per_day: 'Среднее/день', best_hour: 'Лучший час', best_day: 'Лучший день', period_today: 'Сегодня', period_7days: '7 дней', period_30days: '30 дней', period_all: 'Всё время', bar_chart: 'Столбцы', line_chart: 'Линия', heatmap_title: 'Тепловая карта кликов', referrers: 'Источники', devices: 'Устройства', browsers: 'Браузеры', operating_systems: 'ОС', countries: 'Страны', languages: 'Языки', cities: 'Города', direct: 'Прямой', export_stats: 'Экспорт статистики CSV', no_stats: 'Кликов пока нет', compare_links: 'Сравнение ссылок', select_2_4: 'Выберите 2-4 ссылки для сравнения', winner: 'Лучший', qr_title: 'QR-коды', qr_new: 'Новый QR-код', qr_label: 'Метка', qr_label_ph: 'напр. Флаер, Постер...', qr_style: 'Стиль', qr_fg: 'Цвет', qr_bg: 'Фон', qr_create: 'Создать QR', qr_download: 'Скачать PNG', qr_clicks: 'кликов через QR', qr_delete: 'Удалить QR', qr_confirm_delete: 'Удалить этот QR-код?', rules_title: 'Умные правила редиректа', rules_loading: 'Загрузка правил...', no_rules: 'Нет правил редиректа. Все посетители попадут на URL по умолчанию.', add_rule: 'Добавить правило', rule_type: 'Тип', rule_value: 'Значение', rule_dest: 'Целевой URL', rule_priority: 'Приоритет', rule_device: 'Устройство', rule_browser: 'Браузер', rule_os: 'Операционная система', rule_language: 'Язык', rule_country: 'Страна', rule_rotation: 'Ротация URL', rotation_url: 'URL', rotation_weight: 'Вес', add_rotation_url: '+ Добавить URL', save_rules: 'Сохранить правила', rules_saved: 'Правила сохранены', max_rules: 'Максимум 20 правил', growth: 'Рост', active_links: 'Активных ссылок', total_links_dash: 'Всего кликов', best_campaign: 'Лучшая кампания', trend_30d: 'Тренд за 30 дней', top_campaigns: 'Рейтинг кампаний', top_hours: 'Лучшие часы', top_days: 'Лучшие дни', activity: 'Активность', days: 'дней', less: 'Меньше', more: 'Больше', mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс', preview_title: 'Превью', auto_fill: 'Автозаполнение', paste_clipboard: 'Вставить из буфера', fetching_preview: 'Загрузка превью...', og_section: 'Превью для соцсетей (OG теги)', og_title: 'OG Заголовок', og_description: 'OG Описание', og_image: 'OG Изображение (URL)', og_preview: 'Превью карточки', og_auto: 'Автоматически из URL', pin: 'Закрепить', unpin: 'Открепить', pinned: 'Закреплено', pinned_only: 'Только закреплённые', show_on_bio: 'Показать в Bio', bio_page: 'Bio-страница', bio_username: 'Имя пользователя', bio_display_name: 'Отображаемое имя', bio_text: 'О себе', bio_avatar: 'URL аватара', bio_theme: 'Цвет темы', bio_background: 'Фон', bio_public: 'Публичный', bio_save: 'Сохранить профиль', bio_preview: 'Предпросмотр', bio_url: 'Ваш Bio URL', bio_no_profile: 'Создайте Bio-страницу чтобы делиться всеми ссылками в одном месте', bio_saved: 'Bio-профиль сохранён!', bio_username_taken: 'Имя пользователя уже занято', bg_gradient: 'Градиент', bg_solid: 'Заливка', bg_dots: 'Точки', bg_waves: 'Волны', tabBio: 'Bio-страница', confetti: 'Ссылка создана!', campaigns: 'Кампании', url: 'URL', no_qr: 'QR-кодов пока нет', generate_qr: 'Сгенерировать QR-код', default: 'Стандартный', dots: 'Точки', rounded: 'Скруглённый', foreground: 'Цвет', background: 'Фон', generate: 'Сгенерировать', download: 'Скачать', qr_generated: 'QR-код создан!', cloned: 'Ссылка клонирована!', clone_error: 'Не удалось клонировать ссылку', bar: 'Столбцы', line: 'Линия', links: 'Ссылки', today: 'Сегодня', close: 'Закрыть', browser: 'Браузер', os: 'ОС', country: 'Страна', device: 'Устройство', language: 'Язык', priority: 'Приоритет', rotation: 'Ротация', weight: 'Вес', value: 'Значение', unknown: 'Неизвестно', all_time: 'Всё время', no_campaigns: 'Кампаний пока нет', campaign_created: 'Кампания создана!', campaign_leaderboard: 'Рейтинг кампаний', click_heatmap: 'Тепловая карта кликов', clicks_trend: 'Тренд кликов', create_error: 'Не удалось создать ссылку', delete_error: 'Не удалось удалить', update_error: 'Не удалось обновить', fill_all_fields: 'Заполните все обязательные поля', growth_rate: 'Темп роста', add_url: 'Добавить URL', rotation_help: 'Распределение трафика между несколькими URL', rule_deleted: 'Правило удалено' }
    },
    guideLabels: { what: 'Что это?', howTo: 'Как использовать', useCases: 'Применение' },
    pageGuide: {
      create: { guide_what: 'Профессиональный генератор анимированных баннеров. Создавайте GIF, MP4 или WebP баннеры с 15+ размерами, 12 анимациями, частицами, стилизацией текста, фоновыми изображениями и 4 уровнями качества.', guide_steps: '1. Выберите Простой или Расширенный режим\\n2. Введите заголовок и подзаголовок\\n3. Выберите размер и формат (GIF/MP4/WebP)\\n4. Настройте цвета, шрифты, анимации и эффекты\\n5. Добавьте логотип и фоновое изображение\\n6. Нажмите "Сгенерировать" и скачайте баннер', guide_uses: 'Рекламные баннеры для Google Ads и соцсетей\\nПромо-баннеры для распродаж\\nАнимированные посты и сторис\\nЗаголовки для email-рассылок' },
      templates: { guide_what: 'Готовые шаблоны баннеров по отраслям: Казино, Соцсети, Магазины, Технологии, Еда, Фитнес, Недвижимость, Путешествия. Один клик загружает все настройки в генератор.', guide_steps: '1. Просматривайте шаблоны по категориям\\n2. Предпросмотр каждого шаблона\\n3. Нажмите "Использовать" для загрузки в генератор\\n4. Настройте текст, цвета и эффекты под свой бренд\\n5. Сгенерируйте персонализированный баннер', guide_uses: 'Быстрый старт когда баннер нужен срочно\\nВдохновение для собственных дизайнов\\nЕдинообразие стиля в кампаниях' },
      history: { guide_what: 'Просмотр всех ранее сгенерированных баннеров. Повторная загрузка, регенерация с обновлёнными настройками, удаление ненужных.', guide_steps: '1. Просматривайте историю по дате\\n2. "Скачать" для загрузки баннера\\n3. "Повторить" для создания новой версии\\n4. "Удалить" для очистки', guide_uses: 'Повторная загрузка созданных баннеров\\nОтслеживание итераций дизайна\\nРегенерация с улучшенными настройками' },
      saved: { guide_what: 'Сохранённые баннеры с готовыми кодами для вставки. Копируйте HTML-код и вставляйте на сайт, блог или в email-шаблон.', guide_steps: '1. После генерации баннер появляется в "Сохранённых"\\n2. Нажмите "Получить код" для просмотра HTML\\n3. Скопируйте код и вставьте на сайт\\n4. Баннер будет отображаться с отслеживанием кликов', guide_uses: 'Встраивание баннеров на сайт или блог\\nДобавление анимированных баннеров в email\\nПередача кода клиентам' },
      batch: { guide_what: 'Генерация до 20 вариантов баннеров за раз. Идеально для A/B тестирования заголовков, размеров или стилей одновременно.', guide_steps: '1. Нажмите "Добавить баннер" (до 20 штук)\\n2. Задайте разные тексты, размеры и форматы\\n3. Нажмите "Сгенерировать все"\\n4. Скачайте все результаты', guide_uses: 'A/B тестирование вариантов заголовков\\nСоздание баннеров разных размеров для одной кампании\\nМассовое производство для рекламных сетей' },
      stats: { guide_what: 'Статистика кликов по баннерам в реальном времени. Общие клики, уникальные посетители, топ источников, фильтры по периодам.', guide_steps: '1. Откройте Статистику для обзора\\n2. Фильтруйте по "Только с кликами" или периоду\\n3. Просматривайте общие и уникальные клики\\n4. Изучайте источники трафика', guide_uses: 'Измерение эффективности баннерной рекламы\\nОпределение лучших дизайнов\\nОптимизация кампаний на основе данных' },
      logos: { guide_what: 'Загрузка и организация логотипов. Поддержка PNG, JPG, SVG, WebP (до 5МБ). Логотипы можно добавлять в любой баннер.', guide_steps: '1. Нажмите "Загрузить логотип" и выберите файл\\n2. Управляйте библиотекой (переименование, избранное, теги)\\n3. При создании баннера выберите логотип из списка\\n4. Настройте размер и прозрачность', guide_uses: 'Добавление логотипов в рекламные баннеры\\nБиблиотека логотипов клиентов\\nБыстрый доступ к брендовым ассетам' },
      analytics: { guide_what: 'Общая аналитика платформы. Всего генераций, активные пользователи, дневные тренды, популярные размеры, пиковые часы.', guide_steps: '1. Откройте Аналитику для обзора дашборда\\n2. Изучите количество генераций и тренды\\n3. Посмотрите популярные размеры\\n4. Определите пиковые часы', guide_uses: 'Понимание паттернов использования\\nПланирование в пиковые часы\\nОтслеживание роста' },
      apiKeys: { guide_what: 'Создание API-ключей для программной генерации баннеров. Интеграция BannerGen в свои приложения через REST API.', guide_steps: '1. Нажмите "Создать ключ" и введите название\\n2. Задайте лимит запросов и срок действия\\n3. Скопируйте ключ сразу (показывается один раз!)\\n4. Используйте заголовок X-API-Key в запросах', guide_uses: 'Автоматизация генерации из CMS\\nСоздание white-label инструментов\\nИнтеграция в маркетинговые процессы' },
      growth: { guide_what: 'Реферальная программа с уровнями партнёра (от Новичка до Бриллианта). Делитесь ссылкой, отслеживайте рефералов, стройте команду, используйте промо-инструменты.', guide_steps: '1. Скопируйте реферальную ссылку\\n2. Поделитесь в соцсетях, Telegram или на сайтах\\n3. Отслеживайте рефералов во вкладке "Команда"\\n4. Повышайте уровень партнёра\\n5. Используйте набор промо-баннеров', guide_uses: 'Получение партнёрских уровней через рефералов\\nПостроение команды активных пользователей\\nПродвижение BannerGen на своих каналах' }
    }
  },
  es: { appName: 'Generador de Banners', nav: { home: 'Inicio', dashboard: 'Panel de Control', create: 'Crear Banner', templates: 'Plantillas', history: 'Historial', saved: 'Guardados', stats: 'Estadísticas', batch: 'Modo Lote', logos: 'Logos', analytics: 'Analíticas', apiKeys: 'Claves API', projects: 'Proyectos', account: 'Cuenta', help: 'Ayuda', growth: 'Crecimiento', socialKit: 'Kit Social', qrCode: 'Generador QR', imageTools: 'Herramientas', brandKit: 'Kit de Marca', ogGenerator: 'OG-Image', mockup: 'Mockups', abTest: 'Test A/B', shortener: 'Acortador de URLs' , toolsLabel:'Herramientas', bannerConstructor:'Constructor de Banners', instructions:'Instrucciones', snapshare:'SnapShare', promoPosts:'Publicaciones Promo', promoPostsAuto:'Auto Promo', donors:'Donantes', donate:'Apoyar Proyecto', wpPlugin:'Plugin WordPress', subscription:'Suscripción', finance:'Finanzas', matrix:'Matrices', affiliate:'Afiliados', leaderboard:'Clasificación', adminMatrix:'Admin Matrix', ref:'Referidos', hashtagGen:'Generador de Hashtags', removeBg:'Quitar Fondo', aiCaption:'AI Subtítulo', textBehind:'Texto Detrás', pdfTools:'Herramientas PDF', domainFinder:'Buscador de Dominios', videoBanner:'Video Banner', profile:'Perfil', chats:'Chats', bio:'Bio Hub', contentFactory:'Publicación TG', videoStudio:'Video Studio'}, common: { loading: 'Cargando...', error: 'Error', success: 'Éxito', cancel: 'Cancelar', save: 'Guardar', close: 'Cerrar', download: 'Descargar' }, promo: { text: 'Traffic2Gift — Monetización automática', cta: 'Probar Gratis' }, help: { title: 'Centro de Ayuda', nav: 'Ayuda' }, tools: { smk: { title: 'Kit de Redes Sociales' }, qr: { title: 'Generador de Código QR' }, it: { title: 'Herramientas de Imagen' }, bk: { title: 'Kit de Marca' }, og: { title: 'Generador OG-Image' }, mk: { title: 'Generador de Mockup' }, ab: { title: 'Rastreador Test A/B' }, shr: { title: 'Acortador de URLs', subtitle: 'Acorta, rastrea y gestiona tus enlaces', login_required: 'Inicia sesión para usar el acortador de URLs', enter_url: 'Ingresa una URL válida', no_links: 'Aún no hay enlaces. ¡Crea tu primer enlace corto!', loading: 'Cargando', error: 'Error' } } },
  fr: { appName: 'Générateur de Bannières', nav: { home: 'Accueil', dashboard: 'Tableau de Bord', create: 'Créer', templates: 'Modèles', history: 'Historique', saved: 'Sauvegardés', stats: 'Statistiques', batch: 'Mode Lot', logos: 'Logos', analytics: 'Analytique', apiKeys: 'Clés API', projects: 'Projets', account: 'Compte', help: 'Aide', growth: 'Croissance', socialKit: 'Kit Social', qrCode: 'Générateur QR', imageTools: 'Outils Image', brandKit: 'Kit Marque', ogGenerator: 'OG-Image', mockup: 'Mockups', abTest: 'Test A/B', shortener: 'Raccourcisseur d\'URL' , toolsLabel:'Outils', bannerConstructor:'Constructeur de Bannières', instructions:'Instructions', snapshare:'SnapShare', promoPosts:'Publications Promo', promoPostsAuto:'Auto Promo', donors:'Donateurs', donate:'Soutenir le Projet', wpPlugin:'Plugin WordPress', subscription:'Abonnement', finance:'Finances', matrix:'Matrices', affiliate:'Affiliés', leaderboard:'Classement', adminMatrix:'Admin Matrix', ref:'Parrainages', hashtagGen:'Générateur de Hashtags', removeBg:'Supprimer le Fond', aiCaption:'Légende IA', textBehind:'Texte Derrière l\'Image', pdfTools:'Outils PDF', domainFinder:'Recherche de Domaines', videoBanner:'Bannière Vidéo', profile:'Profil', chats:'Discussions', bio:'Bio Hub', contentFactory:'Publication TG', videoStudio:'Studio Vidéo'}, common: { loading: 'Chargement...', error: 'Erreur', success: 'Succès', cancel: 'Annuler', save: 'Enregistrer', close: 'Fermer', download: 'Télécharger' }, promo: { text: 'Traffic2Gift — Monétisation automatique', cta: 'Essai Gratuit' }, help: { title: "Centre d'aide", nav: 'Aide' }, tools: { smk: { title: 'Kit Médias Sociaux' }, qr: { title: 'Générateur de Code QR' }, it: { title: "Outils d'Image" }, bk: { title: 'Kit de Marque' }, og: { title: "Générateur d'OG-Image" }, mk: { title: 'Générateur de Mockup' }, ab: { title: 'Suivi Test A/B' }, shr: { title: 'Raccourcisseur d\'URL', subtitle: 'Raccourcissez, suivez et gérez vos liens', login_required: 'Connectez-vous pour utiliser le raccourcisseur d\'URL', enter_url: 'Veuillez entrer une URL valide', no_links: 'Aucun lien pour le moment. Créez votre premier lien court !', loading: 'Chargement', error: 'Erreur' } } },
  de: { appName: 'Banner-Generator', nav: { home: 'Startseite', dashboard: 'Dashboard', create: 'Erstellen', templates: 'Vorlagen', history: 'Verlauf', saved: 'Gespeichert', stats: 'Statistiken', batch: 'Stapel', logos: 'Logos', analytics: 'Analytik', apiKeys: 'API-Schlüssel', projects: 'Projekte', account: 'Konto', help: 'Hilfe', growth: 'Wachstum', socialKit: 'Social-Kit', qrCode: 'QR-Generator', imageTools: 'Bildtools', brandKit: 'Marken-Kit', ogGenerator: 'OG-Bild', mockup: 'Mockups', abTest: 'A/B-Test', shortener: 'URL-Verkürzer' , toolsLabel:'Werkzeuge', bannerConstructor:'Banner-Konstruktor', instructions:'Anleitung', snapshare:'SnapShare', promoPosts:'Promo-Beiträge', promoPostsAuto:'Auto Promo', donors:'Spender', donate:'Projekt unterstützen', wpPlugin:'WordPress Plugin', subscription:'Abonnement', finance:'Finanzen', matrix:'Matrix', affiliate:'Partner', leaderboard:'Rangliste', adminMatrix:'Admin Matrix', ref:'Empfehlungen', hashtagGen:'Hashtag-Generator', removeBg:'Hintergrund entfernen', aiCaption:'KI-Beschriftung', textBehind:'Text hinter Bild', pdfTools:'PDF-Werkzeuge', domainFinder:'Domain-Suche', videoBanner:'Video-Banner', profile:'Profil', chats:'Chats', bio:'Bio Hub', contentFactory:'TG-Posting', videoStudio:'Video Studio'}, common: { loading: 'Laden...', error: 'Fehler', success: 'Erfolg', cancel: 'Abbrechen', save: 'Speichern', close: 'Schließen', download: 'Herunterladen' }, promo: { text: 'Traffic2Gift — Auto-Monetarisierung', cta: 'Kostenlos' }, help: { title: 'Hilfezentrum', nav: 'Hilfe' }, tools: { smk: { title: 'Social-Media-Kit' }, qr: { title: 'QR-Code-Generator' }, it: { title: 'Bildwerkzeuge' }, bk: { title: 'Marken-Kit' }, og: { title: 'OG-Bild-Generator' }, mk: { title: 'Mockup-Generator' }, ab: { title: 'A/B-Test-Tracker' }, shr: { title: 'URL-Verkürzer', subtitle: 'URLs kürzen, verfolgen und verwalten', login_required: 'Bitte melden Sie sich an, um den URL-Verkürzer zu nutzen', enter_url: 'Bitte geben Sie eine gültige URL ein', no_links: 'Noch keine Links. Erstellen Sie Ihren ersten Kurzlink!', loading: 'Laden', error: 'Fehler' } } },
  zh: { appName: '横幅生成器', nav: { home: '主页', dashboard: '控制面板', create: '创建', templates: '模板', history: '历史', saved: '已保存', stats: '统计', batch: '批量', logos: '标志', analytics: '分析', apiKeys: 'API密钥', projects: '项目', account: '账户', help: '帮助', growth: '增长', socialKit: '社交媒体套件', qrCode: 'QR生成器', imageTools: '图片工具', brandKit: '品牌套件', ogGenerator: 'OG图片', mockup: '样机', abTest: 'A/B测试', shortener: 'URL缩短器' , toolsLabel:'工具', bannerConstructor:'横幅构建器', instructions:'说明', snapshare:'SnapShare', promoPosts:'推广帖子', promoPostsAuto:'自动推广', donors:'捐赠者', donate:'支持项目', wpPlugin:'WordPress 插件', subscription:'订阅', finance:'财务', matrix:'矩阵', affiliate:'联盟营销', leaderboard:'排行榜', adminMatrix:'管理矩阵', ref:'推荐', hashtagGen:'标签生成器', removeBg:'移除背景', aiCaption:'AI 描述', textBehind:'文字在图片后面', pdfTools:'PDF 工具', domainFinder:'域名搜索', videoBanner:'视频横幅', profile:'个人资料', chats:'聊天', bio:'Bio Hub', contentFactory:'TG内容发布', videoStudio:'视频工作室'}, common: { loading: '加载中...', error: '错误', success: '成功', cancel: '取消', save: '保存', close: '关闭', download: '下载' }, promo: { text: 'Traffic2Gift — 自动变现平台', cta: '免费试用' }, help: { title: '帮助中心', nav: '帮助' }, tools: { smk: { title: '社交媒体套件' }, qr: { title: 'QR码生成器' }, it: { title: '图片工具' }, bk: { title: '品牌套件' }, og: { title: 'OG图片生成器' }, mk: { title: '样机生成器' }, ab: { title: 'A/B测试追踪器' }, shr: { title: 'URL缩短器', subtitle: '缩短、追踪和管理您的链接', login_required: '请登录以使用URL缩短器', enter_url: '请输入有效的URL', no_links: '暂无链接。创建您的第一个短链接！', loading: '加载中', error: '错误' } } },
  ja: { appName: 'バナージェネレーター', nav: { home: 'ホーム', dashboard: 'ダッシュボード', create: '作成', templates: 'テンプレート', history: '履歴', saved: '保存済み', stats: '統計', batch: 'バッチ', logos: 'ロゴ', analytics: '分析', apiKeys: 'APIキー', projects: 'プロジェクト', account: 'アカウント', help: 'ヘルプ', growth: '成長', socialKit: 'SNSキット', qrCode: 'QR生成', imageTools: '画像ツール', brandKit: 'ブランドキット', ogGenerator: 'OG画像', mockup: 'モックアップ', abTest: 'A/Bテスト', shortener: 'URL短縮' , toolsLabel:'ツール', bannerConstructor:'バナー作成', instructions:'使い方', snapshare:'SnapShare', promoPosts:'プロモ投稿', promoPostsAuto:'自動プロモ', donors:'寄付者', donate:'プロジェクトを支援', wpPlugin:'WordPress プラグイン', subscription:'サブスクリプション', finance:'ファイナンス', matrix:'マトリックス', affiliate:'アフィリエイト', leaderboard:'ランキング', adminMatrix:'管理マトリックス', ref:'紹介', hashtagGen:'ハッシュタグ生成', removeBg:'背景除去', aiCaption:'AIキャプション', textBehind:'画像の後ろにテキスト', pdfTools:'PDFツール', domainFinder:'ドメイン検索', videoBanner:'ビデオバナー', profile:'プロフィール', chats:'チャット', bio:'Bio Hub', contentFactory:'TGコンテンツ投稿', videoStudio:'ビデオスタジオ'}, common: { loading: '読み込み中...', error: 'エラー', success: '成功', cancel: 'キャンセル', save: '保存', close: '閉じる', download: 'ダウンロード' }, promo: { text: 'Traffic2Gift — 自動収益化', cta: '無料で試す' }, help: { title: 'ヘルプセンター', nav: 'ヘルプ' }, tools: { smk: { title: 'ソーシャルメディアキット' }, qr: { title: 'QRコードジェネレーター' }, it: { title: '画像ツール' }, bk: { title: 'ブランドキット' }, og: { title: 'OG画像ジェネレーター' }, mk: { title: 'モックアップジェネレーター' }, ab: { title: 'A/Bテストトラッカー' }, shr: { title: 'URL短縮', subtitle: 'URLを短縮、追跡、管理', login_required: 'URL短縮を使用するにはログインしてください', enter_url: '有効なURLを入力してください', no_links: 'リンクはまだありません。最初の短縮リンクを作成しましょう！', loading: '読み込み中', error: 'エラー' } } },
  ko: { appName: '배너 생성기', nav: { home: '홈', dashboard: '대시보드', create: '만들기', templates: '템플릿', history: '기록', saved: '저장됨', stats: '통계', batch: '일괄', logos: '로고', analytics: '분석', apiKeys: 'API 키', projects: '프로젝트', account: '계정', help: '도움말', growth: '성장', socialKit: '소셜 키트', qrCode: 'QR 생성', imageTools: '이미지 도구', brandKit: '브랜드 키트', ogGenerator: 'OG이미지', mockup: '목업', abTest: 'A/B 테스트', shortener: 'URL 단축기' , toolsLabel:'도구', bannerConstructor:'배너 생성기', instructions:'사용법', snapshare:'SnapShare', promoPosts:'프로모 게시물', promoPostsAuto:'자동 프로모', donors:'기부자', donate:'프로젝트 지원', wpPlugin:'WordPress 플러그인', subscription:'구독', finance:'재무', matrix:'매트릭스', affiliate:'제휴', leaderboard:'순위', adminMatrix:'관리 매트릭스', ref:'추천', hashtagGen:'해시태그 생성기', removeBg:'배경 제거', aiCaption:'AI 캡션', textBehind:'이미지 뒤 텍스트', pdfTools:'PDF 도구', domainFinder:'도메인 검색', videoBanner:'비디오 배너', profile:'프로필', chats:'채팅', bio:'Bio Hub', contentFactory:'TG 콘텐츠 게시', videoStudio:'비디오 스튜디오'}, common: { loading: '로딩...', error: '오류', success: '성공', cancel: '취소', save: '저장', close: '닫기', download: '다운로드' }, promo: { text: 'Traffic2Gift — 자동 수익화', cta: '무료 체험' }, help: { title: '도움말 센터', nav: '도움말' }, tools: { smk: { title: '소셜 미디어 키트' }, qr: { title: 'QR 코드 생성기' }, it: { title: '이미지 도구' }, bk: { title: '브랜드 키트' }, og: { title: 'OG 이미지 생성기' }, mk: { title: '목업 생성기' }, ab: { title: 'A/B 테스트 추적기' }, shr: { title: 'URL 단축기', subtitle: '링크를 줄이고, 추적하고, 관리하세요', login_required: 'URL 단축기를 사용하려면 로그인하세요', enter_url: '유효한 URL을 입력하세요', no_links: '아직 링크가 없습니다. 첫 번째 단축 링크를 만드세요!', loading: '로딩 중', error: '오류' } } },
  pt: { appName: 'Gerador de Banners', nav: { home: 'Início', dashboard: 'Painel de Controle', create: 'Criar', templates: 'Modelos', history: 'Histórico', saved: 'Salvos', stats: 'Estatísticas', batch: 'Lote', logos: 'Logos', analytics: 'Análises', apiKeys: 'Chaves API', projects: 'Projetos', account: 'Conta', help: 'Ajuda', growth: 'Crescimento', socialKit: 'Kit Social', qrCode: 'Gerador QR', imageTools: 'Ferramentas', brandKit: 'Kit Marca', ogGenerator: 'OG-Image', mockup: 'Mockups', abTest: 'Teste A/B', shortener: 'Encurtador de URL' , toolsLabel:'Ferramentas', bannerConstructor:'Construtor de Banners', instructions:'Instruções', snapshare:'SnapShare', promoPosts:'Posts Promocionais', promoPostsAuto:'Auto Promo', donors:'Doadores', donate:'Apoiar Projeto', wpPlugin:'Plugin WordPress', subscription:'Assinatura', finance:'Finanças', matrix:'Matriz', affiliate:'Afiliados', leaderboard:'Classificação', adminMatrix:'Admin Matrix', ref:'Indicações', hashtagGen:'Gerador de Hashtags', removeBg:'Remover Fundo', aiCaption:'Legenda IA', textBehind:'Texto Atrás da Imagem', pdfTools:'Ferramentas PDF', domainFinder:'Busca de Domínios', videoBanner:'Vídeo Banner', profile:'Perfil', chats:'Conversas', bio:'Bio Hub', contentFactory:'Publicação TG', videoStudio:'Estúdio de Vídeo'}, common: { loading: 'Carregando...', error: 'Erro', success: 'Sucesso', cancel: 'Cancelar', save: 'Salvar', close: 'Fechar', download: 'Baixar' }, promo: { text: 'Traffic2Gift — Monetização automática', cta: 'Teste Grátis' }, help: { title: 'Central de Ajuda', nav: 'Ajuda' }, tools: { smk: { title: 'Kit de Mídia Social' }, qr: { title: 'Gerador de Código QR' }, it: { title: 'Ferramentas de Imagem' }, bk: { title: 'Kit de Marca' }, og: { title: 'Gerador OG-Image' }, mk: { title: 'Gerador de Mockup' }, ab: { title: 'Rastreador Teste A/B' }, shr: { title: 'Encurtador de URL', subtitle: 'Encurte, rastreie e gerencie seus links', login_required: 'Faça login para usar o encurtador de URL', enter_url: 'Insira uma URL válida', no_links: 'Nenhum link ainda. Crie seu primeiro link curto!', loading: 'Carregando', error: 'Erro' } } },
  it: { appName: 'Generatore Banner', nav: { home: 'Home', dashboard: 'Pannello di Controllo', create: 'Crea', templates: 'Modelli', history: 'Cronologia', saved: 'Salvati', stats: 'Statistiche', batch: 'Batch', logos: 'Loghi', analytics: 'Analisi', apiKeys: 'Chiavi API', projects: 'Progetti', account: 'Account', help: 'Aiuto', growth: 'Crescita', socialKit: 'Kit Social', qrCode: 'Generatore QR', imageTools: 'Strumenti', brandKit: 'Kit Brand', ogGenerator: 'OG-Image', mockup: 'Mockup', abTest: 'Test A/B', shortener: 'Abbreviatore URL' }, common: { loading: 'Caricamento...', error: 'Errore', success: 'Successo', cancel: 'Annulla', save: 'Salva', close: 'Chiudi', download: 'Scarica' }, promo: { text: 'Traffic2Gift — Monetizzazione automatica', cta: 'Prova Gratis' }, help: { title: 'Centro assistenza', nav: 'Aiuto' }, tools: { smk: { title: 'Kit Social Media' }, qr: { title: 'Generatore Codice QR' }, it: { title: 'Strumenti Immagine' }, bk: { title: 'Kit Brand' }, og: { title: 'Generatore OG-Image' }, mk: { title: 'Generatore Mockup' }, ab: { title: 'Tracker Test A/B' }, shr: { title: 'Abbreviatore URL', subtitle: 'Abbrevia, traccia e gestisci i tuoi link', login_required: 'Accedi per utilizzare l\'abbreviatore URL', enter_url: 'Inserisci un URL valido', no_links: 'Nessun link ancora. Crea il tuo primo link breve!', loading: 'Caricamento', error: 'Errore' } } },
  ar: { appName: 'مولد البانرات', nav: { home: 'الرئيسية', dashboard: 'لوحة التحكم', create: 'إنشاء', templates: 'قوالب', history: 'السجل', saved: 'المحفوظة', stats: 'الإحصائيات', batch: 'دفعة', logos: 'شعارات', analytics: 'تحليلات', apiKeys: 'مفاتيح API', projects: 'المشاريع', account: 'حساب', help: 'مساعدة', growth: 'النمو', socialKit: 'مجموعة اجتماعية', qrCode: 'مولد QR', imageTools: 'أدوات الصور', brandKit: 'هوية العلامة', ogGenerator: 'صور OG', mockup: 'نموذج', abTest: 'اختبار A/B', shortener: 'مختصر الروابط' , toolsLabel:'أدوات', bannerConstructor:'منشئ اللافتات', instructions:'التعليمات', snapshare:'SnapShare', promoPosts:'منشورات ترويجية', promoPostsAuto:'ترويج تلقائي', donors:'المتبرعون', donate:'دعم المشروع', wpPlugin:'إضافة ووردبريس', subscription:'الاشتراك', finance:'المالية', matrix:'المصفوفة', affiliate:'التسويق بالعمولة', leaderboard:'لوحة المتصدرين', adminMatrix:'مصفوفة الإدارة', ref:'الإحالات', hashtagGen:'مولد الهاشتاج', removeBg:'إزالة الخلفية', aiCaption:'تعليق ذكي', textBehind:'نص خلف الصورة', pdfTools:'أدوات PDF', domainFinder:'باحث النطاقات', videoBanner:'بانر فيديو', profile:'الملف الشخصي', chats:'المحادثات', bio:'Bio Hub', contentFactory:'نشر محتوى TG', videoStudio:'استوديو الفيديو'}, common: { loading: '...جاري التحميل', error: 'خطأ', success: 'نجاح', cancel: 'إلغاء', save: 'حفظ', close: 'إغلاق', download: 'تحميل' }, promo: { text: 'Traffic2Gift — تحقيق الدخل التلقائي', cta: 'جرب مجاناً' }, help: { title: 'مركز المساعدة', nav: 'مساعدة' }, tools: { smk: { title: 'مجموعة وسائل التواصل' }, qr: { title: 'مولد رمز QR' }, it: { title: 'أدوات الصور' }, bk: { title: 'هوية العلامة التجارية' }, og: { title: 'مولد صور OG' }, mk: { title: 'مولد النماذج' }, ab: { title: 'متتبع اختبار A/B' }, shr: { title: 'مختصر الروابط', subtitle: 'اختصر وتتبع وأدر روابطك', login_required: 'يرجى تسجيل الدخول لاستخدام مختصر الروابط', enter_url: 'يرجى إدخال رابط صالح', no_links: 'لا توجد روابط بعد. أنشئ أول رابط مختصر!', loading: 'جاري التحميل', error: 'خطأ' } } },
  hi: { appName: 'बैनर जनरेटर', nav: { home: 'मुख्य पृष्ठ', dashboard: 'डैशबोर्ड', create: 'बनाएं', templates: 'टेम्पलेट', history: 'इतिहास', saved: 'सहेजे गए', stats: 'आँकड़े', batch: 'बैच', logos: 'लोगो', analytics: 'विश्लेषण', apiKeys: 'API कुंजी', projects: 'परियोजनाएं', account: 'खाता', help: 'सहायता', growth: 'विकास', socialKit: 'सोशल किट', qrCode: 'QR जनरेटर', imageTools: 'छवि उपकरण', brandKit: 'ब्रांड किट', ogGenerator: 'OG छवि', mockup: 'मॉकअप', abTest: 'A/B टेस्ट', shortener: 'URL शॉर्टनर' , toolsLabel:'उपकरण', bannerConstructor:'बैनर निर्माता', instructions:'निर्देश', snapshare:'SnapShare', promoPosts:'प्रोमो पोस्ट', promoPostsAuto:'ऑटो प्रोमो', donors:'दानकर्ता', donate:'प्रोजेक्ट सपोर्ट', wpPlugin:'WordPress प्लगइन', subscription:'सदस्यता', finance:'वित्त', matrix:'मैट्रिक्स', affiliate:'सहबद्ध', leaderboard:'लीडरबोर्ड', adminMatrix:'एडमिन मैट्रिक्स', ref:'रेफरल', hashtagGen:'हैशटैग जनरेटर', removeBg:'बैकग्राउंड हटाएं', aiCaption:'AI कैप्शन', textBehind:'छवि के पीछे टेक्स्ट', pdfTools:'PDF उपकरण', domainFinder:'डोमेन खोज', videoBanner:'वीडियो बैनर', profile:'प्रोफाइल', chats:'चैट', bio:'Bio Hub', contentFactory:'TG कंटेंट पोस्टिंग', videoStudio:'वीडियो स्टूडियो'}, common: { loading: 'लोड हो रहा...', error: 'त्रुटि', success: 'सफलता', cancel: 'रद्द करें', save: 'सहेजें', close: 'बंद करें', download: 'डाउनलोड' }, promo: { text: 'Traffic2Gift — ऑटो-मोनेटाइजेशन', cta: 'मुफ्त आज़माएं' }, help: { title: 'सहायता केंद्र', nav: 'सहायता' }, tools: { smk: { title: 'सोशल मीडिया किट' }, qr: { title: 'QR कोड जनरेटर' }, it: { title: 'छवि उपकरण' }, bk: { title: 'ब्रांड किट' }, og: { title: 'OG-छवि जनरेटर' }, mk: { title: 'मॉकअप जनरेटर' }, ab: { title: 'A/B टेस्ट ट्रैकर' }, shr: { title: 'URL शॉर्टनर', subtitle: 'लिंक छोटा करें, ट्रैक करें और प्रबंधित करें', login_required: 'URL शॉर्टनर उपयोग करने के लिए लॉग इन करें', enter_url: 'कृपया एक मान्य URL दर्ज करें', no_links: 'अभी कोई लिंक नहीं है। अपना पहला शॉर्ट लिंक बनाएं!', loading: 'लोड हो रहा है', error: 'त्रुटि' } } },
  tr: { appName: 'Banner Oluşturucu', nav: { home: 'Ana Sayfa', dashboard: 'Kontrol Paneli', create: 'Oluştur', templates: 'Şablonlar', history: 'Geçmiş', saved: 'Kaydedilenler', stats: 'İstatistikler', batch: 'Toplu', logos: 'Logolar', analytics: 'Analitik', apiKeys: 'API Anahtarları', projects: 'Projeler', account: 'Hesap', help: 'Yardım', growth: 'Büyüme', socialKit: 'Sosyal Kit', qrCode: 'QR Oluşturucu', imageTools: 'Görsel Araçları', brandKit: 'Marka Kiti', ogGenerator: 'OG Görsel', mockup: 'Mockup', abTest: 'A/B Test', shortener: 'URL Kısaltıcı' , toolsLabel:'Araçlar', bannerConstructor:'Banner Oluşturucu', instructions:'Talimatlar', snapshare:'SnapShare', promoPosts:'Tanıtım Paylaşımları', promoPostsAuto:'Otomatik Tanıtım', donors:'Bağışçılar', donate:'Projeyi Destekle', wpPlugin:'WordPress Eklentisi', subscription:'Abonelik', finance:'Finans', matrix:'Matris', affiliate:'Ortaklık', leaderboard:'Sıralama', adminMatrix:'Yönetici Matrisi', ref:'Referanslar', hashtagGen:'Hashtag Oluşturucu', removeBg:'Arka Plan Kaldır', aiCaption:'AI Altyazı', textBehind:'Resmin Arkasına Metin', pdfTools:'PDF Araçları', domainFinder:'Alan Adı Arama', videoBanner:'Video Banner', profile:'Profil', chats:'Sohbetler', bio:'Bio Hub', contentFactory:'TG İçerik Yayını', videoStudio:'Video Stüdyo'}, common: { loading: 'Yükleniyor...', error: 'Hata', success: 'Başarılı', cancel: 'İptal', save: 'Kaydet', close: 'Kapat', download: 'İndir' }, promo: { text: 'Traffic2Gift — Otomatik para kazanma', cta: 'Ücretsiz Dene' }, help: { title: 'Yardım Merkezi', nav: 'Yardım' }, tools: { smk: { title: 'Sosyal Medya Kiti' }, qr: { title: 'QR Kod Oluşturucu' }, it: { title: 'Görsel Araçları' }, bk: { title: 'Marka Kiti' }, og: { title: 'OG Görsel Oluşturucu' }, mk: { title: 'Mockup Oluşturucu' }, ab: { title: 'A/B Test Takipçisi' }, shr: { title: 'URL Kısaltıcı', subtitle: 'Bağlantıları kısaltın, takip edin ve yönetin', login_required: 'URL kısaltıcıyı kullanmak için giriş yapın', enter_url: 'Lütfen geçerli bir URL girin', no_links: 'Henüz bağlantı yok. İlk kısa bağlantınızı oluşturun!', loading: 'Yükleniyor', error: 'Hata' } } }
};

translations.ru = translations.ru || {};
translations.ru.nav = Object.assign({}, translations.ru.nav, {
  subscription: 'Подписка',
  finance: 'Финансы',
        matrix: 'Матрица',
  instructions: 'Инструкция',
  wpPlugin: 'WordPress плагин'
});
translations.ru.instructions = {
  title: 'Инструкция',
  kicker: 'Единый центр подсказок',
  intro: 'Откройте нужный блок ниже, чтобы быстро понять, что делает функция, как её настроить и где она полезна в рабочем процессе.',
  quickTitle: 'Быстрый старт',
  quickSteps: '1. Выберите нужную зону: креатив, маркетинг, аналитика или сообщество\\n2. Откройте карточку функции и сначала прочитайте, что именно она делает\\n3. Выполняйте шаги настройки по порядку, чтобы не пропустить обязательные поля и авторизацию\\n4. Используйте кнопку «Открыть функцию», чтобы сразу перейти в нужный раздел',
  openFeature: 'Открыть функцию',
  guideButton: 'Открыть подсказку',
  sections: {
    workspace: 'Рабочее пространство и рост',
    creative: 'Креативные инструменты',
    marketing: 'Маркетинг и автоматизация',
    analytics: 'Аналитика и интеграции',
    community: 'Сообщество и поддержка'
  },
  tooltips: {
    postLanguage: 'Выбирает язык готового текста постов. Переключайте его под аудиторию, для которой публикуете.',
    platform: 'Задаёт основную платформу публикации. Ссылки, тексты и превью подготавливаются в первую очередь под неё.',
    serviceFilter: 'Показывает все промо-сервисы или сужает рабочую область до одного инструмента для точечной подготовки кампании.',
    shareVisible: 'Запускает публикацию для всех видимых карточек. С desktop agent задачи уходят в очередь, без него открываются браузерные share-окна.',
    copyVisible: 'Копирует общий campaign pack по видимым сервисам, чтобы быстро вставить его в планировщик, чат или документ.',
    refresh: 'Перезагружает короткие ссылки, клики и текущий статус agent с сервера.',
    automationScope: 'Определяет, какие платформы войдут в мультиплатформенную автоматизацию и в копируемый campaign pack.',
    agentStatus: 'Показывает, подключён ли desktop helper, и сколько задач сейчас в очереди или в работе.',
    createToken: 'Создаёт новый token для подключения desktop automation agent к вашему аккаунту.',
    sharePlatforms: 'Позволяет запускать публикацию в выбранные платформы без смены основного фильтра.',
    openTool: 'Открывает исходный инструмент, связанный с этим промо-сервисом, чтобы вы могли обновить ассеты или ссылку.',
    shortLink: 'Отслеживаемая короткая ссылка с нужными параметрами кампании для этого сервиса и платформы.'
  }
};
translations.ru.pageGuide = Object.assign({}, translations.ru.pageGuide, {
  dashboard: {
    guide_what: 'Личный рабочий экран с последней активностью, баннерами, ссылками и ростом по рефералам в одном месте.',
    guide_steps: '1. Откройте дашборд после входа в аккаунт\\n2. Посмотрите общие показатели по баннерам, ссылкам и кликам\\n3. Проверьте свежую активность и динамику за неделю\\n4. Переходите дальше в нужный инструмент прямо отсюда',
    guide_uses: 'Ежедневный обзор аккаунта\\nБыстрый вход в активную работу\\nКонтроль прогресса без открытия каждого раздела отдельно'
  },
  projects: {
    guide_what: 'Каталог экосистемы Arsenal с описаниями проектов и ссылками, которые можно привязать к вашим реферальным данным.',
    guide_steps: '1. Откройте раздел проектов и изучите доступные продукты\\n2. Прикрепите свои реферальные ссылки там, где это нужно\\n3. Поделитесь общей реферальной страницей или отдельными ссылками\\n4. Отслеживайте рост переходов и регистраций в связанных инструментах',
    guide_uses: 'Обзор всей экосистемы инструментов\\nСборка реферального лендинга\\nРаспространение ссылок с уже привязанной монетизацией'
  },
  promoPosts: {
    guide_what: 'Ручная зона промо-публикаций, где заранее собираются отслеживаемые короткие ссылки, готовые тексты и быстрые share-действия по каждому сервису.',
    guide_steps: '1. Выберите язык постов, платформу и фильтр по сервису\\n2. Просмотрите готовый текст и короткую ссылку для каждого сервиса\\n3. Копируйте текст или ссылку либо публикуйте через браузерные share-окна\\n4. При необходимости создайте token для будущего подключения desktop automation',
    guide_uses: 'Подготовка промо-постов без API\\nРучная публикация кампаний с отслеживаемыми ссылками\\nЕдиное соблюдение реферальных и UTM-параметров'
  },
  promoPostsAuto: {
    guide_what: 'Расширенная auto-зона для мультиплатформенной публикации, очередей desktop helper, browser extension и готовых campaign pack в один клик.',
    guide_steps: '1. Настройте язык постов, основную платформу и при необходимости фильтр сервиса\\n2. Выберите automation scope, отметив одну или несколько платформ\\n3. Подключите desktop helper или browser extension через agent token\\n4. Запустите automation для видимого набора или отправьте один сервис в очередь подключённому клиенту\\n5. Скопируйте campaign pack, если нужен ручной fallback',
    guide_uses: 'Мультиплатформенное распространение промо\\nПубликация через desktop helper или browser extension\\nПодготовка готовых наборов для ассистентов и команды'
  },
  wpPlugin: {
    guide_what: 'Точка входа для интеграции WordPress с Arsenal, чтобы связать генерацию материалов и сайт на одной стороне.',
    guide_steps: '1. Откройте страницу плагина и проверьте требования к установке\\n2. Подключите плагин или скопируйте нужные параметры интеграции\\n3. Проверьте авторизацию и настройки генерации\\n4. Протестируйте отдачу баннеров или контента в WordPress',
    guide_uses: 'Связка Arsenal с WordPress-процессами\\nГенерация ассетов из CMS\\nСнижение ручной передачи материалов между сервисом и сайтом'
  },
  donors: {
    guide_what: 'Публичная доска благодарности с ведущими донаторами и заметными вкладами в развитие проекта.',
    guide_steps: '1. Откройте страницу донаторов и посмотрите текущих участников\\n2. Проверьте позиции, уровни и блоки признания\\n3. Используйте раздел как публичный сигнал доверия и поддержки проекта',
    guide_uses: 'Показ поддержки сообщества\\nПубличная благодарность участникам\\nДобавление социального доказательства для проекта'
  },
  donate: {
    guide_what: 'Страница поддержки проекта с вариантами доната и пояснением, зачем нужен вклад.',
    guide_steps: '1. Откройте страницу доната\\n2. Выберите удобный способ оплаты или формат поддержки\\n3. Завершите перевод и подтвердите участие\\n4. Вернитесь позже, чтобы проверить бонусы или упоминание, если они предусмотрены',
    guide_uses: 'Финансирование разработки\\nПоддержка сопровождения инструментов\\nПолучение донорских бонусов или упоминаний там, где они есть'
  }
});

translations.en = translations.en || {};
translations.en.nav = Object.assign({}, translations.en.nav, {
  subscription: 'Subscription',
  finance: 'Finance',
        matrix: 'Matrix Tables',
        affiliate: 'Affiliate',
        leaderboard: 'Leaderboard',
        adminMatrix: 'Admin Matrix',
        matrix: 'Matrix',
  ref: 'Menu',
  hashtagGen: 'Hashtag Generator',
  removeBg: 'Remove Background',
  aiCaption: 'AI Caption',
  textBehind: 'Text Behind Image',
  pdfTools: 'PDF Tools',
  domainFinder: 'Domain Finder',
  videoBanner: 'Video Banner'
});
translations.en.apiKeys = Object.assign({}, translations.en.apiKeys, {
  type: 'Key Type',
  typeBanner: 'Banner API',
  typeWordpress: 'WordPress Plugin',
  siteUrl: 'Site URL',
  noExpiry: 'No expiry',
  neverUsed: 'Never used',
  regenerate: 'Regenerate'
});
translations.ru = translations.ru || {};
translations.ru.nav = Object.assign({}, translations.ru.nav, {
  ref: 'Menu',
  hashtagGen: 'Генератор хэштегов',
  removeBg: 'Удаление фона',
  aiCaption: 'AI подписи',
  textBehind: 'Текст за изображением',
  pdfTools: 'PDF инструменты',
  domainFinder: 'Поиск доменов',
  videoBanner: 'Видео баннер'
});
translations.ru.apiKeys = Object.assign({}, translations.ru.apiKeys, {
  type: 'Тип ключа',
  typeBanner: 'Banner API',
  typeWordpress: 'WordPress Plugin',
  siteUrl: 'URL сайта',
  noExpiry: 'Без срока',
  neverUsed: 'Не использовался',
  regenerate: 'Пересоздать'
});

// Keep nav keys required by restored pages even if base locale objects were trimmed.
translations.en = translations.en || {};
translations.en.nav = translations.en.nav || {};
translations.en.nav.profile = translations.en.nav.profile || 'Profile';
translations.en.nav.chats = translations.en.nav.chats || 'Chats';
translations.en.nav.bio = translations.en.nav.bio || 'Bio Hub';
translations.ru = translations.ru || {};
translations.ru.nav = translations.ru.nav || {};
translations.ru.nav.profile = translations.ru.nav.profile || '\u041f\u0440\u043e\u0444\u0438\u043b\u044c';
translations.ru.nav.chats = translations.ru.nav.chats || '\u0427\u0430\u0442\u044b';
translations.ru.nav.bio = translations.ru.nav.bio || 'Bio Hub';

// Recovery fallback for restored Bio / Marketplace / Custom Domain blocks.
const restoredShrKeys = [
  'bio_24h','bio_30d','bio_7d','bio_90d','bio_ab_active','bio_ab_applied','bio_ab_apply_b','bio_ab_apply_confirm','bio_ab_clicks',
  'bio_ab_desc','bio_ab_end','bio_ab_end_confirm','bio_ab_ended','bio_ab_history','bio_ab_impressions','bio_ab_original','bio_ab_split',
  'bio_ab_split_ratio','bio_ab_start','bio_ab_started','bio_ab_test_name','bio_ab_tie','bio_ab_title','bio_ab_variant','bio_ab_variant_b',
  'bio_add_divider','bio_add_heading','bio_add_image','bio_add_link','bio_add_text','bio_ai_applied','bio_ai_apply_all','bio_ai_apply_text',
  'bio_ai_apply_theme','bio_ai_bg','bio_ai_bold','bio_ai_btn','bio_ai_color','bio_ai_creative','bio_ai_desc_short','bio_ai_description',
  'bio_ai_generate','bio_ai_language','bio_ai_minimal','bio_ai_name','bio_ai_placeholder','bio_ai_professional','bio_ai_result',
  'bio_ai_socials','bio_ai_style','bio_ai_success','bio_ai_title','bio_all_time','bio_avatar','bio_background','bio_basic_info',
  'bio_browsers','bio_btn_style','bio_clone','bio_cloned','bio_create','bio_create_first','bio_create_page','bio_created','bio_delete',
  'bio_delete_confirm','bio_delete_link_confirm','bio_deleted','bio_devices','bio_display_name','bio_link_added','bio_link_deleted',
  'bio_links','bio_meta_desc','bio_meta_title','bio_meta_title_hint','bio_more_actions','bio_new_page','bio_no_links','bio_no_pages',
  'bio_page_login','bio_page_name','bio_pages','bio_period_views','bio_preview','bio_public','bio_save','bio_saved','bio_show_avatar',
  'bio_social_links','bio_stats','bio_text','bio_theme','bio_theme_color','bio_top_links','bio_total_clicks','bio_total_views','bio_url',
  'bio_views_chart','cd_add','cd_add_new','cd_added','cd_domain','cd_instructions','cd_not_verified','cd_remove_confirm','cd_removed',
  'cd_step1','cd_step2','cd_step3','cd_title','cd_verified','cd_verify','mp_add_product','mp_added_to_bio','mp_bio_products','mp_browse',
  'mp_browse_title','mp_category','mp_delete_confirm','mp_deleted','mp_description','mp_download_url','mp_my_products','mp_no_marketplace',
  'mp_no_products','mp_preview_image','mp_price','mp_products','mp_removed_from_bio','mp_revenue','mp_sales','mp_save','mp_saved','mp_title'
];

function restoredShrLabel(key) {
  const stripped = String(key || '').replace(/^(bio_|mp_|cd_)/, '');
  const words = stripped.split('_').filter(Boolean).map((part) => {
    const low = part.toLowerCase();
    if (low === 'ai') return 'AI';
    if (low === 'ab') return 'A/B';
    if (low === 'qr') return 'QR';
    if (low === 'url') return 'URL';
    if (/^\d+[hd]$/.test(low)) return low.toUpperCase();
    return low.charAt(0).toUpperCase() + low.slice(1);
  });
  return words.join(' ') || key;
}

['en', 'ru'].forEach((langKey) => {
  translations[langKey] = translations[langKey] || {};
  translations[langKey].tools = translations[langKey].tools || {};
  translations[langKey].tools.shr = translations[langKey].tools.shr || {};
  restoredShrKeys.forEach((k) => {
    if (!translations[langKey][k]) translations[langKey][k] = restoredShrLabel(k);
    if (!translations[langKey].tools.shr[k]) translations[langKey].tools.shr[k] = translations[langKey][k];
  });
});

Object.keys(translations).forEach((langKey) => {
  translations[langKey] = translations[langKey] || {};
  translations[langKey].appName = 'Arsenal Profi';
});

const rtlLanguages = ['ar'];

function t(key, lang) {
  lang = lang || window.currentLang || 'en';
  const keys = key.split('.');
  let val = translations[lang];
  for (const k of keys) {
    val = val?.[k];
    if (val === undefined) break;
  }
  // Fallback to English
  if (val === undefined) {
    val = translations.en;
    for (const k of keys) {
      val = val?.[k];
      if (val === undefined) break;
    }
  }
  return val || key;
}

function detectLanguage() {
  const saved = localStorage.getItem('lang');
  if (saved && translations[saved]) return saved;
  const browser = navigator.language.split('-')[0];
  return translations[browser] ? browser : 'en';
}

function setLanguage(lang) {
  window.currentLang = lang;
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;
  if (rtlLanguages.includes(lang)) {
    document.body.classList.add('rtl');
  } else {
    document.body.classList.remove('rtl');
  }
}


// ── aiTools.textBehind translations ───────────────────────────────────────────
translations.en.aiTools = Object.assign({}, translations.en.aiTools || {}, {
  textBehind: {
    title: 'Text Behind Image',
    desc: 'Place text behind subjects in your photos using AI background removal',
    uploadTitle: 'Upload your photo',
    uploadSub: 'Drag & drop or click to select (PNG, JPG, WebP)',
    textLabel: 'Text',
    fontLabel: 'Font',
    sizeLabel: 'Size',
    colorLabel: 'Text Color',
    strokeLabel: 'Stroke Color',
    strokeWidthLabel: 'Stroke Width',
    positionLabel: 'Position',
    posTop: 'Top',
    posCenter: 'Center',
    posBottom: 'Bottom',
    download: '⬇ Download Image',
    empty: 'Upload a photo to get started',
    emptySub: 'The text will appear behind the main subject',
    processing: 'Removing background...',
    ready: 'Done! Adjust the text below.',
    tryAnother: 'Try a different photo or format'
  }
});
translations.ru.aiTools = Object.assign({}, translations.ru.aiTools || {}, {
  textBehind: {
    title: 'Текст за изображением',
    desc: 'Помещайте текст за объектами на фото с помощью AI удаления фона',
    uploadTitle: 'Загрузите фото',
    uploadSub: 'Перетащите или нажмите для выбора (PNG, JPG, WebP)',
    textLabel: 'Текст',
    fontLabel: 'Шрифт',
    sizeLabel: 'Размер',
    colorLabel: 'Цвет текста',
    strokeLabel: 'Цвет обводки',
    strokeWidthLabel: 'Толщина обводки',
    positionLabel: 'Позиция',
    posTop: 'Вверху',
    posCenter: 'По центру',
    posBottom: 'Внизу',
    download: '⬇ Скачать изображение',
    empty: 'Загрузите фото чтобы начать',
    emptySub: 'Текст появится за главным объектом',
    processing: 'Удаление фона...',
    ready: 'Готово! Настройте текст ниже.',
    tryAnother: 'Попробуйте другое фото или формат'
  }
});
window.i18n = { t, translations, detectLanguage, setLanguage, rtlLanguages };

// ─── Content Factory + Video Studio guide keys (EN) ───
(function() {
  var en = translations.en;
  if (!en.pageGuide) en.pageGuide = {};
  en.pageGuide.contentFactory = {
    guide_what: 'Content Factory is your automatic content publishing system. Create projects that generate and publish AI-powered posts, video banners, QR codes, OG images, and videos to Telegram channels and websites on a schedule. Supports content alternation — rotate between different content types automatically.',
    guide_steps: '1. Go to Content Factory and click "New Project"\n2. Set a name, AI prompt template, and target language (RU/EN/both)\n3. Add referral links that will be embedded in posts\n4. Choose content types: AI Text, Video Banner 600x600, QR Code, OG Image, Video from pool\n5. Enable Alternation Mode to automatically rotate between content types\n6. Connect a Telegram channel: enter @username and bot token, then verify with a test message\n7. Optionally add a WordPress site: enter URL, username, and app password\n8. Upload videos or paste URLs (TikTok, Instagram, YouTube, VK, Twitter/X, Facebook, Rutube, OK)\n9. Configure video processing: uniqueness, watermark, video banner overlay, transcription\n10. Set the number of posts per day and publication times\n11. Click Start — the system will publish automatically on schedule',
    guide_uses: 'Automated Telegram channel content publishing\nSEO blog posting to WordPress with AI-generated articles\nAffiliate marketing with embedded referral links in every post\nMulti-format campaigns: alternate between text, banners, QR codes, videos\nVideo repurposing: download from any platform, process, and republish\nHands-free content funnel running 24/7'
  };
  en.pageGuide.videoStudio = {
    guide_what: 'Video Studio is a comprehensive video processing toolkit. Download videos from any platform (TikTok, Instagram, YouTube, VK, Twitter/X), make them unique to bypass duplicate detection, add watermarks, translate and dub into 20+ languages, convert to vertical Reels format, and overlay video banners. Process one video or run the full pipeline in sequence.',
    guide_steps: '1. Go to Video Studio and choose a tab: Download, Translate, Reels Cut, Watermark, Uniqueness, or Full Pipeline\n2. Download tab: paste a video URL from any platform and click Download\n3. Translate tab: upload or provide URL, select target language and voice (male/female), choose mode (subtitles/dubbing/both)\n4. Reels Cut tab: convert horizontal 16:9 video to vertical 9:16 with blur/padding/crop background\n5. Watermark tab: add text watermark (10 positions, custom font/color/size) or banner overlay (PNG/GIF/MP4 with opacity and motion)\n6. Uniqueness tab: choose preset (safe/balanced/aggressive) — applies mirror, speed change, color correction, crop\n7. Full Pipeline tab: enable any combination of steps, they run in sequence automatically\n8. Track progress in the task list below\n9. Download the result or publish directly to a Content Factory project',
    guide_uses: 'Download TikTok/Instagram/YouTube videos without watermarks\nTranslate foreign videos into your language with AI dubbing\nMake videos unique for reposting without copyright strikes\nConvert horizontal videos to vertical Reels/Shorts/TikTok format\nBrand videos with your watermark or logo overlay\nBatch video processing for content agencies'
  };

  // Nav keys
  if (!en.nav) en.nav = {};
  en.nav.adCenter = 'TG Autoposting';
  en.nav.adExchange = 'Ad Exchange';
  en.nav.promoMaterials = 'Promo Materials';
  en.nav.contentFactory = 'TG Content Posting';
  en.nav.videoStudio = 'Video Studio';

  // Section title
  if (!en.instructions) en.instructions = {};
  if (!en.instructions.sections) en.instructions.sections = {};
  en.instructions.sections.contentFactory = 'Content Factory';
})();

// ─── Content Factory + Video Studio guide keys (RU) ───
(function() {
  var ru = translations.ru;
  var mk = translations.mk || (translations.mk = { nav: {}, pageGuide: {} });
  var tr = translations.tr;
  var hi = translations.hi;
  var ar = translations.ar;
  var pt = translations.pt;
  var ko = translations.ko;
  var ja = translations.ja;
  var zh = translations.zh;
  var de = translations.de;
  var fr = translations.fr;
  var es = translations.es;
  if (!ru.pageGuide) ru.pageGuide = {};
  ru.pageGuide.contentFactory = {
    guide_what: 'Content Factory — система автоматической публикации контента. Создавайте проекты, которые генерируют и публикуют AI-посты, видео-баннеры, QR-коды, OG-изображения и видео в Telegram-каналы и на сайты по расписанию. Поддерживает режим чередования — автоматически переключается между разными типами контента.',
    guide_steps: '1. Перейдите в Content Factory и нажмите «Новый проект»\n2. Задайте имя, промт-шаблон для AI и целевой язык (RU/EN/оба)\n3. Добавьте реферальные ссылки — они будут вставляться в каждый пост\n4. Выберите типы контента: AI-текст, Видео-баннер 600x600, QR-код, OG-изображение, Видео из пула\n5. Включите «Режим чередования» для автоматической ротации типов контента\n6. Подключите Telegram-канал: введите @username и токен бота, затем проверьте тестовым сообщением\n7. Опционально добавьте WordPress-сайт: укажите URL, логин и пароль приложения\n8. Загрузите видео или вставьте ссылки (TikTok, Instagram, YouTube, VK, Twitter/X, Facebook, Rutube, OK)\n9. Настройте обработку видео: уникализация, вотермарк, встройка видео-баннера, транскрипция\n10. Установите количество постов в день и время публикации\n11. Нажмите «Запустить» — система будет публиковать автоматически по расписанию',
    guide_uses: 'Автоматическая публикация контента в Telegram-каналы\nSEO-публикации на WordPress с AI-генерированными статьями\nПартнёрский маркетинг — реферальные ссылки в каждом посте\nМультиформатные кампании: чередование текста, баннеров, QR-кодов, видео\nВидео-репостинг: скачать с любой платформы, обработать и опубликовать\nАвтономная контент-воронка, работающая 24/7'
  };
  ru.pageGuide.videoStudio = {
    guide_what: 'Video Studio — комплексный набор инструментов для обработки видео. Скачивайте видео с любой платформы (TikTok, Instagram, YouTube, VK, Twitter/X), делайте их уникальными для обхода детекции дублей, добавляйте вотермарки, переводите и озвучивайте на 20+ языков, конвертируйте в вертикальный формат Reels, накладывайте видео-баннеры. Обрабатывайте одно видео или запускайте полный пайплайн.',
    guide_steps: '1. Перейдите в Video Studio и выберите вкладку: Скачать, Перевести, Reels Cut, Вотермарк, Уникализация или Полный Pipeline\n2. Вкладка «Скачать»: вставьте URL видео с любой платформы и нажмите «Скачать»\n3. Вкладка «Перевести»: загрузите видео или укажите URL, выберите целевой язык и голос (муж/жен), режим (субтитры/дубляж/оба)\n4. Вкладка «Reels Cut»: конвертируйте горизонтальное видео 16:9 в вертикальное 9:16 с размытым/чёрным фоном или кропом\n5. Вкладка «Вотермарк»: добавьте текстовый вотермарк (10 позиций, шрифт/цвет/размер) или баннер-оверлей (PNG/GIF/MP4 с прозрачностью и движением)\n6. Вкладка «Уникализация»: выберите пресет (безопасный/сбалансированный/агрессивный) — зеркало, скорость, цветокоррекция, кроп\n7. Вкладка «Полный Pipeline»: включите любую комбинацию шагов, они выполнятся последовательно\n8. Отслеживайте прогресс в списке задач ниже\n9. Скачайте результат или опубликуйте в проект Content Factory',
    guide_uses: 'Скачивание видео с TikTok/Instagram/YouTube без водяных знаков\nПеревод иностранных видео на ваш язык с AI-озвучкой\nУникализация видео для репоста без блокировок\nКонвертация горизонтальных видео в вертикальные Reels/Shorts/TikTok\nБрендирование видео вашим вотермарком или логотипом\nПакетная обработка видео для контент-агентств'
  };

  // Nav keys
  if (!ru.nav) ru.nav = {};
  ru.nav.adCenter = 'Автопостинг TG';
  if (!mk.nav) mk.nav = {};
  mk.pageGuide = mk.pageGuide || {};
  mk.pageGuide.adx = { title: 'Берза за Реклами', desc: 'Купувајте и продавајте реклами во Telegram канали. Таргетирање по тема и јазик.' };

  tr.pageGuide = tr.pageGuide || {};
  tr.pageGuide.adx = { title: 'Reklam Borsası', desc: 'Telegram kanallarında reklam alın ve satın. Konu ve dile göre hedefleme.' };

  hi.pageGuide = hi.pageGuide || {};
  hi.pageGuide.adx = { title: 'विज्ञापन एक्सचेंज', desc: 'Telegram चैनलों में विज्ञापन खरीदें और बेचें। विषय और भाषा के अनुसार लक्ष्यीकरण।' };

  ar.pageGuide = ar.pageGuide || {};
  ar.pageGuide.adx = { title: 'بورصة الإعلانات', desc: 'اشتر وبع الإعلانات في قنوات Telegram. استهداف حسب الموضوع واللغة.' };

  pt.pageGuide = pt.pageGuide || {};
  pt.pageGuide.adx = { title: 'Bolsa de Publicidade', desc: 'Compre e venda publicidade em canais do Telegram. Segmentação por tema e idioma.' };

  ko.pageGuide = ko.pageGuide || {};
  ko.pageGuide.adx = { title: '광고 거래소', desc: 'Telegram 채널에서 광고를 사고팔 수 있습니다. 주제와 언어별 타겟팅.' };

  ja.pageGuide = ja.pageGuide || {};
  ja.pageGuide.adx = { title: '広告取引所', desc: 'Telegramチャンネルで広告を売買できます。トピックや言語でターゲティング。' };

  zh.pageGuide = zh.pageGuide || {};
  zh.pageGuide.adx = { title: '广告交易所', desc: '在Telegram频道中买卖广告。按主题和语言定向投放。' };

  de.pageGuide = de.pageGuide || {};
  de.pageGuide.adx = { title: 'Werbebörse', desc: 'Kaufen und verkaufen Sie Werbung in Telegram-Kanälen. Targeting nach Thema und Sprache.' };

  fr.pageGuide = fr.pageGuide || {};
  fr.pageGuide.adx = { title: 'Bourse Publicitaire', desc: 'Achetez et vendez de la publicité sur les chaînes Telegram. Ciblage par sujet et langue.' };

  es.pageGuide = es.pageGuide || {};
  es.pageGuide.adx = { title: 'Bolsa de Publicidad', desc: 'Compra y vende publicidad en canales de Telegram. Segmentación por tema e idioma.' };

  ru.nav.adExchange = 'Рекламная биржа';
  ru.nav.promoMaterials = 'Промо Материалы';
  mk.nav.adCenter = 'Автопостинг TG';
  mk.nav.adExchange = 'Берза за Реклами';
  mk.nav.promoMaterials = 'Промо Материјали';
  tr.nav.adCenter = 'TG Oto-Yayın';
  tr.nav.adExchange = 'Reklam Borsası';
  tr.nav.promoMaterials = 'Promosyon Materyalleri';
  hi.nav.adCenter = 'TG ऑटोपोस्टिंग';
  hi.nav.adExchange = 'विज्ञापन एक्सचेंज';
  hi.nav.promoMaterials = 'प्रोमो सामग्री';
  ar.nav.adCenter = 'نشر تلقائي TG';
  ar.nav.adExchange = 'بورصة الإعلانات';
  ar.nav.promoMaterials = 'مواد ترويجية';
  pt.nav.adCenter = 'Autoposting TG';
  pt.nav.adExchange = 'Bolsa de Publicidade';
  pt.nav.promoMaterials = 'Materiais Promo';
  ko.nav.adCenter = 'TG 자동게시';
  ko.nav.adExchange = '광고 거래소';
  ko.nav.promoMaterials = '프로모 자료';
  ja.nav.adCenter = 'TGオートポスト';
  ja.nav.adExchange = '広告取引所';
  ja.nav.promoMaterials = 'プロモ素材';
  zh.nav.adCenter = 'TG自动发布';
  zh.nav.adExchange = '广告交易所';
  zh.nav.promoMaterials = '推广材料';
  de.nav.adCenter = 'Werbezentrum';
  de.nav.adExchange = 'Werbebörse';
  de.nav.promoMaterials = 'Promo-Materialien';
  fr.nav.adCenter = 'Centre Annonces';
  fr.nav.adExchange = 'Bourse Publicitaire';
  fr.nav.promoMaterials = 'Matériaux Promo';
  es.nav.adCenter = 'Centro de Anuncios';
  es.nav.adExchange = 'Bolsa de Publicidad';
  es.nav.promoMaterials = 'Materiales Promo';
  ru.nav.contentFactory = 'Контент постинг TG';
  ru.nav.videoStudio = 'Видео Студия';

  // Section title
  if (!ru.instructions) ru.instructions = {};
  if (!ru.instructions.sections) ru.instructions.sections = {};
  ru.instructions.sections.contentFactory = 'Content Factory';
})();


// ─── Ad Center v2 guide keys (EN) ───
(function() {
  var en = translations.en;
  if (!en.pageGuide) en.pageGuide = {};
  en.pageGuide.adCenter = {
    guide_what: 'Ad Center is your all-in-one Telegram advertising hub. Create and send broadcasts to multiple channels at once, schedule recurring auto-campaigns, build post templates, set up auto-import from YouTube/TikTok channels, view analytics, and manage your content calendar — all in one place.',
    guide_steps: '1. Connect your Telegram channels in the "Sources" tab — add the bot @ARSENALPROFIbot as admin\n2. Go to "Instant Broadcast" to send a post right now: write text, attach media, pick channels, and click Send\n3. Use "Auto Broadcast" to create recurring campaigns that send on a schedule\n4. Save frequently used post formats as Templates for one-click reuse\n5. Set up Auto-Import monitors to automatically pull new videos from YouTube/TikTok channels\n6. Open Analytics to see delivery rates, best posting hours, and channel performance\n7. Use the Calendar to see all scheduled and sent posts in a month view\n8. UTM tags are added automatically to all links — track traffic sources effortlessly',
    guide_uses: 'Automated daily posts to multiple Telegram channels\nScheduled promotional campaigns with AI-generated text\nAuto-import from YouTube/TikTok with transcription and banner overlay\nA/B testing of post variants to find the best performing content\nChannel analytics: delivery rate, best hours, dead channels\nContent calendar for planning and reviewing your posting schedule'
  };
  en.pageGuide.adcInstant = {
    guide_what: 'Instant Broadcast lets you send a post to one or more Telegram channels right now. Write your message, attach a video or image, add inline keyboard buttons, and choose which channels to send to. The system tracks delivery and failure per channel.',
    guide_steps: '1. Write your post text in the text area\n2. Optionally attach a video URL (YouTube/TikTok/direct) — it will be downloaded and sent\n3. Add inline keyboard buttons for links (optional)\n4. Select one or more target channels from the list\n5. Enable UTM auto-tagging if your text contains links\n6. Click "Send Broadcast" — posts are sent immediately\n7. After sending, use "Save as Template" to reuse this post format',
    guide_uses: 'Urgent announcements to all channels\nPromo posts with video and call-to-action buttons\nProduct launches with immediate multi-channel reach'
  };
  en.pageGuide.adcAuto = {
    guide_what: 'Auto Broadcast creates scheduled campaigns that send posts automatically on a recurring schedule. Set up once and it runs forever — daily, hourly, or at custom intervals. Each send can use AI to rewrite the post text to keep it fresh.',
    guide_steps: '1. Go to "Auto Broadcast" tab and click "New Schedule"\n2. Select a campaign (create one in Campaigns tab first)\n3. Choose source channels and frequency (e.g. every 6 hours)\n4. Enable "AI Rewrite" to auto-generate fresh text each time\n5. Set a start time and optionally an end date\n6. Save — the system will send automatically at the specified times',
    guide_uses: 'Daily motivational posts to your community\nRecurring promo campaigns running without manual work\nAB-tested content rotation on autopilot'
  };
  en.pageGuide.adcTemplates = {
    guide_what: 'Post Templates let you save your best-performing post formats and reuse them with one click. Store text, media URL, button configurations, and UTM settings — then apply any template when creating a new post.',
    guide_steps: '1. Create a post in Instant Broadcast\n2. Click "Save as Template" after sending\n3. Give your template a name\n4. Go to "Templates" tab to see all saved templates\n5. Click "Use" on any template to pre-fill the post form\n6. Edit as needed and send',
    guide_uses: 'Consistent promotional post format across campaigns\nQuick posting for recurring content types\nTeam collaboration — share template formats'
  };
  en.pageGuide.adcMonitor = {
    guide_what: 'Auto-Import monitors automatically watch YouTube or TikTok channels for new videos. When a new video is found, it downloads it, transcribes it with AI, adds your video banner overlay, generates a post caption, and sends it to your Telegram channels — all automatically.',
    guide_steps: '1. Go to "Auto-Import" tab and click "New Monitor"\n2. Enter the YouTube channel URL or TikTok username\n3. Select which Telegram channels to publish to\n4. Configure options: watermark text, banner overlay, AI caption\n5. Set check interval (e.g. every hour)\n6. Click "Save" — the monitor will check for new content automatically\n7. Use "Run Now" to trigger an immediate check',
    guide_uses: 'Auto-repost content from YouTube influencers to your Telegram channel\nMirror your own YouTube/TikTok to Telegram automatically\nCurate niche content with AI summaries and your branding'
  };
  en.pageGuide.adcAnalytics = {
    guide_what: 'Channel Analytics shows performance data for all your connected Telegram channels. See total sent vs failed messages, delivery rate percentage, posts sent this week, and the best posting hours based on your historical data.',
    guide_steps: '1. Go to "Analytics" tab\n2. See summary cards: total posts, sent, failed, delivery rate\n3. Each channel shows: total sent, delivery rate, sends this week, last send time\n4. The bar chart shows sends per day for the past 2 weeks\n5. "Best Hours" shows the top posting times based on your history\n6. Use this data to optimize your Auto Broadcast schedules',
    guide_uses: 'Identify dead or low-performing channels\nFind the best time of day to post for maximum reach\nTrack overall campaign delivery performance'
  };
  en.pageGuide.adcCalendar = {
    guide_what: 'The Content Calendar shows all your scheduled, sent, and queued posts in a monthly view. See what was sent on each day, what auto-campaigns are active, and what is queued in the Smart Queue. Plan your content month ahead.',
    guide_steps: '1. Go to "Calendar" tab\n2. Navigate months with < > arrows\n3. Green dots = sent posts, blue dots = active schedules, purple = queued\n4. Click on a date to see post details\n5. Use Smart Queue in Instant Broadcast to automatically spread posts across optimal hours',
    guide_uses: 'Visual overview of your entire content schedule\nSpot gaps in posting frequency\nCoordinate campaigns across time periods'
  };

  en.pageGuide.adx = {
    guide_what: 'Ad Exchange is a marketplace where you can buy advertising in Telegram channels or monetize your own channel. Advertisers browse channels by topic, subscribers count, language and price — then place orders. Channel owners receive 90% of the order price. All payments go through your Arsenal Profi balance.',
    guide_steps: '1. Go to Ad Exchange and explore the marketplace — filter channels by category, language, price and subscribers\n2. To BUY ads: add channels to cart, choose duration (24h/48h/72h), create your ad post and pay from your balance\n3. To SELL ads: click "Add Channel" — select from your Ad Center channels or enter @username manually\n4. Set your price per 24h — prices for 48h and 72h are calculated automatically (×1.7 and ×2.2)\n5. After moderation (up to 24h), your channel appears in the marketplace\n6. When an advertiser orders, you receive a notification — approve or reject the order\n7. After approval, the ad is published automatically. You earn 90% of the order price\n8. Track your earnings in the "Earnings" tab\n9. Use AI Channel Selection to get smart recommendations based on your ad description and budget',
    guide_uses: 'Buy targeted advertising in niche Telegram channels\nMonetize your Telegram channel — earn money from ad placements\nFind channels by topic, language and audience size\nAI-powered channel recommendations for your ad campaign\nAutomatic ad publishing after order approval\nTrack earnings and order history in one dashboard'
  };
  if (!en.nav) en.nav = {};
  en.nav.adCenter = en.nav.adCenter || 'Ad Center';
  if (!en.instructions) en.instructions = {};
  if (!en.instructions.sections) en.instructions.sections = {};
  en.instructions.sections.adCenter = 'Ad Center — Telegram Marketing';
})();

// ─── Ad Center v2 guide keys (RU) ───
(function() {
  var ru = translations.ru;
  var mk = translations.mk || (translations.mk = { nav: {}, pageGuide: {} });
  var tr = translations.tr;
  var hi = translations.hi;
  var ar = translations.ar;
  var pt = translations.pt;
  var ko = translations.ko;
  var ja = translations.ja;
  var zh = translations.zh;
  var de = translations.de;
  var fr = translations.fr;
  var es = translations.es;
  if (!ru.pageGuide) ru.pageGuide = {};
  ru.pageGuide.adx = {
    guide_what: 'Рекламная биржа — маркетплейс для покупки и продажи рекламы в Telegram-каналах. Рекламодатели выбирают каналы по тематике, количеству подписчиков, языку и цене — и размещают заказы. Владельцы каналов получают 90% от стоимости заказа. Все расчёты через баланс Arsenal Profi.',
    guide_steps: '1. Перейдите в Рекламную биржу и изучите маркетплейс — фильтры по категории, языку, цене и подписчикам\n2. Чтобы КУПИТЬ рекламу: добавьте каналы в корзину, выберите длительность (24ч/48ч/72ч), создайте рекламный пост и оплатите с баланса\n3. Чтобы ПРОДАТЬ рекламу: нажмите «Добавить канал» — выберите из каналов Ad Center или введите @username вручную\n4. Установите цену за 24ч — цены за 48ч и 72ч рассчитаются автоматически (×1.7 и ×2.2)\n5. После модерации (до 24ч) канал появится в маркетплейсе\n6. Когда рекламодатель оформит заказ — вы получите уведомление. Одобрите или отклоните заказ\n7. После одобрения реклама публикуется автоматически. Вы получаете 90% от стоимости заказа\n8. Отслеживайте доходы во вкладке «Доходы»\n9. Используйте AI-подбор каналов для умных рекомендаций по вашему бюджету и описанию рекламы',
    guide_uses: 'Покупка таргетированной рекламы в нишевых Telegram-каналах\nМонетизация вашего Telegram-канала — заработок на размещении рекламы\nПоиск каналов по тематике, языку и размеру аудитории\nAI-подбор каналов по описанию рекламы и бюджету\nАвтоматическая публикация рекламы после одобрения заказа\nОтслеживание доходов и истории заказов в одном месте'
  };

  ru.pageGuide.adCenter = {
    guide_what: 'Ad Center — единый центр управления рекламой в Telegram. Создавайте и отправляйте рассылки в несколько каналов одновременно, планируйте повторяющиеся авторассылки, сохраняйте шаблоны постов, настраивайте автоимпорт с YouTube/TikTok, смотрите аналитику и управляйте контент-календарём — всё в одном месте.',
    guide_steps: '1. Подключите Telegram-каналы во вкладке «Источники» — добавьте бота @ARSENALPROFIbot как администратора\n2. Перейдите в «Мгновенная рассылка» чтобы отправить пост прямо сейчас\n3. Используйте «Авторассылки» для повторяющихся кампаний по расписанию\n4. Сохраняйте часто используемые форматы постов как Шаблоны\n5. Настройте мониторы Автоимпорта для автоматической загрузки видео с YouTube/TikTok\n6. Откройте Аналитику для просмотра доставляемости и лучших часов публикации\n7. Используйте Календарь для обзора запланированных и отправленных постов\n8. UTM-метки добавляются автоматически ко всем ссылкам',
    guide_uses: 'Автоматические ежедневные посты в несколько Telegram-каналов\nПланируемые рекламные кампании с AI-генерацией текста\nАвтоимпорт с YouTube/TikTok с транскрипцией и баннерами\nA/B-тестирование вариантов постов для поиска лучшего контента\nАналитика каналов: доставляемость, лучшие часы, мёртвые каналы\nКонтент-календарь для планирования и анализа публикаций'
  };
  ru.pageGuide.adcInstant = {
    guide_what: 'Мгновенная рассылка позволяет отправить пост в один или несколько Telegram-каналов прямо сейчас. Напишите сообщение, прикрепите видео или изображение, добавьте кнопки с ссылками и выберите каналы.',
    guide_steps: '1. Напишите текст поста в текстовом поле\n2. Опционально укажите URL видео (YouTube/TikTok/прямая ссылка)\n3. Добавьте кнопки с ссылками (inline keyboard)\n4. Выберите один или несколько целевых каналов\n5. Включите UTM-авторазметку если в тексте есть ссылки\n6. Нажмите «Отправить рассылку»\n7. После отправки нажмите «Сохранить как шаблон» для повторного использования',
    guide_uses: 'Срочные объявления для всех каналов\nПромо-посты с видео и кнопками призыва к действию\nЗапуск продуктов с охватом всех каналов одновременно'
  };
  ru.pageGuide.adcAuto = {
    guide_what: 'Авторассылки создают запланированные кампании, которые отправляют посты автоматически по расписанию. Настройте один раз — работает постоянно. Каждая отправка может использовать AI для рерайта текста.',
    guide_steps: '1. Перейдите во вкладку «Авторассылки» и нажмите «Новое расписание»\n2. Выберите кампанию (создайте её во вкладке «Кампании»)\n3. Выберите каналы и частоту (например, каждые 6 часов)\n4. Включите «AI-рерайт» для автогенерации свежего текста\n5. Установите время старта и опционально дату окончания\n6. Сохраните — система будет отправлять автоматически',
    guide_uses: 'Ежедневные мотивационные посты для сообщества\nПовторяющиеся рекламные кампании без ручной работы\nРотация AB-тестируемого контента на автопилоте'
  };
  ru.pageGuide.adcTemplates = {
    guide_what: 'Шаблоны постов позволяют сохранять лучшие форматы постов и использовать их одним кликом. Сохраните текст, медиа, кнопки и UTM-настройки — затем применяйте любой шаблон при создании нового поста.',
    guide_steps: '1. Создайте пост в Мгновенной рассылке\n2. После отправки нажмите «Сохранить как шаблон»\n3. Дайте шаблону имя\n4. Перейдите во вкладку «Шаблоны» для просмотра\n5. Нажмите «Использовать» на любом шаблоне для заполнения формы\n6. При необходимости отредактируйте и отправьте',
    guide_uses: 'Единый формат промо-постов во всех кампаниях\nБыстрая публикация для повторяющихся типов контента\nКомандное сотрудничество — общие форматы шаблонов'
  };
  ru.pageGuide.adcMonitor = {
    guide_what: 'Автоимпорт следит за YouTube или TikTok каналами. При появлении нового видео — скачивает его, транскрибирует с помощью AI, добавляет ваш видео-баннер, генерирует подпись и отправляет в Telegram-каналы. Всё автоматически.',
    guide_steps: '1. Перейдите во вкладку «Автоимпорт» и нажмите «Новый монитор»\n2. Введите URL YouTube-канала или ник TikTok\n3. Выберите Telegram-каналы для публикации\n4. Настройте параметры: текст вотермарка, видео-баннер, AI-подпись\n5. Установите интервал проверки (например, каждый час)\n6. Нажмите «Сохранить» — монитор будет проверять автоматически\n7. Используйте «Запустить сейчас» для мгновенной проверки',
    guide_uses: 'Авторепостинг контента с YouTube в Telegram-канал\nЗеркалирование вашего YouTube/TikTok в Telegram автоматически\nКуратор нишевого контента с AI-резюме и вашим брендингом'
  };
  ru.pageGuide.adcAnalytics = {
    guide_what: 'Аналитика каналов показывает данные о производительности всех подключённых Telegram-каналов: общее количество отправленных/неудачных сообщений, процент доставки, посты за неделю и лучшие часы для публикации.',
    guide_steps: '1. Перейдите во вкладку «Аналитика»\n2. Смотрите карточки: всего постов, отправлено, ошибки, доставляемость\n3. Для каждого канала: итого отправлено, доставляемость, за неделю, последняя отправка\n4. Гистограмма показывает отправки по дням за 2 недели\n5. «Лучшие часы» — топ-часы публикации по вашей истории\n6. Используйте данные для оптимизации расписания авторассылок',
    guide_uses: 'Выявление мёртвых или низко-эффективных каналов\nПоиск лучшего времени суток для максимального охвата\nОтслеживание общей доставляемости кампаний'
  };
  ru.pageGuide.adcCalendar = {
    guide_what: 'Контент-календарь показывает все запланированные, отправленные и поставленные в очередь посты в месячном представлении. Видите что было отправлено каждый день, какие авторассылки активны и что стоит в Smart Queue.',
    guide_steps: '1. Перейдите во вкладку «Календарь»\n2. Навигация по месяцам кнопками < >\n3. Зелёные точки = отправленные посты, синие = активные расписания, фиолетовые = очередь\n4. Нажмите на дату для просмотра деталей\n5. Используйте Smart Queue в Мгновенной рассылке для распределения постов по оптимальным часам',
    guide_uses: 'Визуальный обзор всего контент-расписания\nВыявление пробелов в частоте публикаций\nКоординация кампаний по периодам'
  };
  if (!ru.nav) ru.nav = {};
  ru.nav.adCenter = ru.nav.adCenter || 'Центр Рекламы';
  if (!ru.instructions) ru.instructions = {};
  if (!ru.instructions.sections) ru.instructions.sections = {};
  ru.instructions.sections.adCenter = 'Ad Center — Telegram Маркетинг';
})();

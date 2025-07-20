const Task = require('../../../models/Task');
const Device = require('../../../models/Device');
const { ObjectId } = require('mongoose').Types;

exports.getTaskById = async (req, res) => {
    console.log('=== getTaskById DEBUGGING ===');
    console.log('Request path:', req.path);
    console.log('Request params:', req.params);
    console.log('Request headers:', req.headers);
    console.log('Request user:', req.user);
    console.log('Request auth header:', req.headers.authorization);
    
    try {
        // Check if user exists
        if (!req.user) {
            console.error('ERROR: req.user is null or undefined');
            return res.status(401).json({ error: 'Authentication required: User not found in request' });
        }

        // Extract task ID from params
        const { taskId } = req.params;
        console.log('Task ID:', taskId);
        
        // Get user ID
        const userId = req.user._id;
        console.log('User ID:', userId);

        // Validate task ID
        if (!ObjectId.isValid(taskId)) {
            console.error('ERROR: Invalid Task ID format');
            return res.status(400).json({ error: 'Invalid Task ID' });
        }

        // Find the task
        console.log('Fetching task from database...');
        const task = await Task.findById(taskId)
            .populate('device', 'name')
            .populate('creator', 'name');
        
        console.log('Task found:', task ? 'Yes' : 'No');
        
        if (!task) {
            console.error('ERROR: Task not found');
            return res.status(404).json({ error: 'Task not found' });
        }

        // Verify access
        console.log('Fetching device to verify access...');
        const device = await Device.findById(task.device);
        console.log('Device found:', device ? 'Yes' : 'No');
        
        if (!device) {
            console.error('ERROR: Associated device not found');
            return res.status(404).json({ error: 'Associated device not found' });
        }
        
        // Check authorization
        console.log('Checking authorization...');
        console.log('Task creator:', task.creator);
        console.log('Device creator:', device.creator);
        console.log('Device users:', device.users);
        
        const isCreator = task.creator.equals(userId);
        const isDeviceCreator = device.creator.equals(userId);
        const isDeviceUser = device.users.includes(userId);
        
        console.log('Is task creator:', isCreator);
        console.log('Is device creator:', isDeviceCreator);
        console.log('Is device user:', isDeviceUser);
        
        const isAuthorized = isCreator || isDeviceCreator || isDeviceUser;
        
        if (!isAuthorized) {
            console.error('ERROR: Access denied');
            return res.status(403).json({ error: 'Access denied' });
        }

        console.log('Authorization successful, returning task');
        res.status(200).json({ task });

    } catch (error) {
        console.error('ERROR in getTaskById:', error);
        res.status(500).json({ error: 'Server error', message: error.message });
    }
};

exports.getMyTasks = async (req, res) => {
    console.log('=== [DEBUG] getMyTasks START ===');
    console.log('🔐 Request user object:', req.user);

    try {
        // Check if user is attached to the request
        if (!req.user) {
            console.error('❌ [ERROR] req.user is null or undefined');
            return res.status(401).json({ error: 'Authentication required: User not found in request' });
        }

        const userId = req.user._id;
        console.log('✅ User ID extracted from token:', userId);

        // Validate extracted user ID
        if (!userId) {
            console.error('❌ [ERROR] userId is null or invalid');
            return res.status(401).json({ error: 'Invalid user ID' });
        }

        // Check if Task model is available
        if (typeof Task === 'undefined') {
            console.error('❌ [ERROR] Task model is undefined or not imported');
            return res.status(500).json({ error: 'Server misconfiguration: Task model not available' });
        }

        console.log('📦 Querying database for tasks created by user...');

        const tasks = await Task.find({ creator: userId })
            .select('name device status nextExecution')
            .populate({
                path: 'device',
                select: 'name',
                options: { strictPopulate: false }, // Prevent populate errors if device is null
            })
            .lean();

        if (!Array.isArray(tasks)) {
            console.warn('⚠️ [WARN] Task.find did not return an array. Normalizing...');
        }

        console.log(`📊 Number of tasks found: ${Array.isArray(tasks) ? tasks.length : 0}`);
        if (Array.isArray(tasks) && tasks.length > 0) {
            console.log('🔍 Sample task:', tasks[0]);
        } else {
            console.log('ℹ️ No tasks found for this user.');
        }

        // Normalize the result
        const safeTasks = Array.isArray(tasks) ? tasks : [];

        console.log('✅ Sending tasks response...');
        return res.status(200).json({ tasks: safeTasks });

    } catch (error) {
        console.error('🔥 [ERROR] Exception thrown in getMyTasks:', error.message);
        console.error('📛 Stack trace:\n', error.stack);

        // Handle known Mongoose errors specifically
        if (error.name === 'CastError') {
            console.warn('⚠️ [WARN] Invalid ObjectId format');
            return res.status(400).json({ error: 'Invalid user ID format' });
        }

        if (error.name === 'ValidationError') {
            console.warn('⚠️ [WARN] Mongoose validation error:', error.message);
            return res.status(400).json({ error: 'Validation error', details: error.message });
        }

        // Fallback error response
        return res.status(500).json({ 
            error: 'Server error', 
            message: process.env.NODE_ENV === 'production' 
                ? 'Internal server error' 
                : error.message 
        });
    }
};

exports.getTasksByDevice = async (req, res) => {
    console.log('=== getTasksByDevice DEBUGGING ===');
    console.log('Request user:', req.user);
    console.log('Request params:', req.params);
    
    try {
        if (!req.user) {
            console.error('ERROR: req.user is null or undefined');
            return res.status(401).json({ error: 'Authentication required: User not found in request' });
        }
        
        const { deviceId } = req.params;
        const userId = req.user._id;
        
        console.log('Device ID:', deviceId);
        console.log('User ID:', userId);

        if (!ObjectId.isValid(deviceId)) {
            console.error('ERROR: Invalid Device ID format');
            return res.status(400).json({ error: 'Invalid Device ID' });
        }

        const device = await Device.findById(deviceId);
        console.log('Device found:', device ? 'Yes' : 'No');
        
        if (!device) {
            console.error('ERROR: Device not found');
            return res.status(404).json({ error: 'Device not found' });
        }

        const isCreator = device.creator.equals(userId);
        const isUser = device.users.includes(userId);
        console.log('Is device creator:', isCreator);
        console.log('Is device user:', isUser);
        
        const isAuthorized = isCreator || isUser;
        if (!isAuthorized) {
            console.error('ERROR: Access denied');
            return res.status(403).json({ error: 'Access denied' });
        }

        const tasks = await Task.find({ device: deviceId })
            .populate('device', 'name')
            .populate('creator', 'name');
            
        console.log('Tasks found:', tasks.length);
        res.status(200).json({ device: device.name, tasks });

    } catch (error) {
        console.error('ERROR in getTasksByDevice:', error);
        res.status(500).json({ error: 'Server error', message: error.message });
    }
};

exports.getAssignedTasks = async (req, res) => {
    console.log('=== getAssignedTasks DEBUGGING ===');
    console.log('Request user:', req.user);
    
    try {
        if (!req.user) {
            console.error('ERROR: req.user is null or undefined');
            return res.status(401).json({ error: 'Authentication required: User not found in request' });
        }
        
        const userId = req.user._id;
        console.log('User ID:', userId);

        const tasks = await Task.find({ 'notifications.recipients': userId })
            .select('name device status nextExecution')
            .populate('device', 'name');
            
        console.log('Tasks found:', tasks.length);
        res.status(200).json({ tasks });

    } catch (error) {
        console.error('ERROR in getAssignedTasks:', error);
        res.status(500).json({ error: 'Server error', message: error.message });
    }
};

exports.getFilteredTasks = async (req, res) => {
    console.log('=== getFilteredTasks DEBUGGING ===');
    console.log('Request user:', req.user);
    console.log('Request query:', req.query);
    
    try {
        if (!req.user) {
            console.error('ERROR: req.user is null or undefined');
            return res.status(401).json({ error: 'Authentication required: User not found in request' });
        }
        
        const { status, startDate, endDate, sort, limit = 10, page = 1 } = req.query;
        const userId = req.user._id;
        console.log('User ID:', userId);

        const query = { creator: userId };
        console.log('Base query:', query);

        // Filter by status
        if (status) {
            query.status = status;
            console.log('Added status filter:', status);
        }

        // Filter by date range
        if (startDate) {
            query['schedule.startDate'] = { $gte: new Date(startDate) };
            console.log('Added start date filter:', startDate);
        }
        
        if (endDate) {
            query['schedule.endDate'] = { ...query['schedule.endDate'], $lte: new Date(endDate) };
            console.log('Added end date filter:', endDate);
        }

        // Pagination & sorting
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOption = sort ? { [sort]: 1 } : { nextExecution: 1 };
        
        console.log('Skip:', skip);
        console.log('Sort option:', sortOption);
        console.log('Limit:', parseInt(limit));
        
        console.log('Executing query with filters:', query);
        const tasks = await Task.find(query)
            .select('name status nextExecution')
            .sort(sortOption)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();
            
        console.log('Tasks found:', tasks.length);

        // Total count for pagination
        const totalTasks = await Task.countDocuments(query);
        const totalPages = Math.ceil(totalTasks / limit);
        
        console.log('Total tasks:', totalTasks);
        console.log('Total pages:', totalPages);

        res.status(200).json({
            tasks,
            pagination: { totalTasks, totalPages, currentPage: parseInt(page), limit: parseInt(limit) }
        });

    } catch (error) {
        console.error('ERROR in getFilteredTasks:', error);
        res.status(500).json({ error: 'Server error', message: error.message });
    }
};
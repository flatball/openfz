let StickStatus = { x: 0, y: 0 };

const JoyStick = function (container, parameters = {}, callback = function () {}) {
    this.size = parameters.size || 130;
    this.title = parameters.title || "joystick";
    this.autoReturn = parameters.autoReturn || true;
    this.externalTextureUrl = parameters.externalTextureUrl || "../images/external_texture.png";
    this.internalTextureUrl = parameters.internalTextureUrl || "../images/internal_texture.png";
    
    this.baseSize = 130;
    this.scaleFactor = this.size / this.baseSize;

    this.width = this.size;
    this.height = this.size;
    this.internalRadius = 25 * this.scaleFactor;
    this.maxMoveStick = 40 * this.scaleFactor;
    this.externalRadius = 50 * this.scaleFactor;

    const objContainer = document.getElementById(container);
    objContainer.style.touchAction = "none";

    this.canvas = document.createElement("canvas");
    this.canvas.id = this.title;

    this.canvas.width = this.width || objContainer.clientWidth;
    this.canvas.height = this.height || objContainer.clientHeight;
    objContainer.appendChild(this.canvas);

    this.context = this.canvas.getContext("2d");
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;

    this.movedX = this.centerX;
    this.movedY = this.centerY;
    this.pressed = false;
    this.touchId = null;

    this.externalTexture = new Image();
    this.internalTexture = new Image();

    this.externalTexture.src = this.externalTextureUrl;
    this.internalTexture.src = this.internalTextureUrl;

    const drawExternal = () => {
        this.context.drawImage(this.externalTexture, this.centerX - this.externalRadius, this.centerY - this.externalRadius, this.externalRadius * 2, this.externalRadius * 2);
    };

    const drawInternal = () => {
        const limitedPos = limitToCircle(this.movedX, this.movedY, this.centerX, this.centerY, this.maxMoveStick);
        this.movedX = limitedPos.x;
        this.movedY = limitedPos.y;

        this.context.drawImage(this.internalTexture, this.movedX - this.internalRadius, this.movedY - this.internalRadius, this.internalRadius * 2, this.internalRadius * 2);
    };

    const limitToCircle = (x, y, centerX, centerY, maxRadius) => {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > maxRadius) {
            const angle = Math.atan2(dy, dx);
            x = centerX + maxRadius * Math.cos(angle);
            y = centerY + maxRadius * Math.sin(angle);
        }
        return { x, y };
    };

    const updateStickStatus = () => {
        StickStatus.x = (100 * ((this.movedX - this.centerX) / this.maxMoveStick)).toFixed();
        StickStatus.y = ((100 * ((this.movedY - this.centerY) / this.maxMoveStick)) * -1).toFixed();
        callback(StickStatus);
    };

    this.update = (parameters) => {
        if (parameters.width) {
            this.canvas.width = parameters.width;
            this.centerX = this.canvas.width / 2;
        }

        if (parameters.height) {
            this.canvas.height = parameters.height;
            this.centerY = this.canvas.height / 2;
        }

        if (parameters.externalRadius) {
            this.externalRadius = parameters.externalRadius;
        }

        if (parameters.internalRadius) {
            this.internalRadius = parameters.internalRadius;
        }

        if (parameters.maxMoveStick) {
            this.maxMoveStick = parameters.maxMoveStick;
        }

        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        drawExternal();
        drawInternal();
        updateStickStatus();
    };

    const handleMovement = (event, pageX, pageY) => {
        this.movedX = pageX;

        if (this.canvas.offsetParent.tagName.toUpperCase() !== "BODY") {
            this.movedX -= this.canvas.offsetParent.offsetLeft;
            this.movedY = pageY - this.canvas.offsetParent.offsetTop;
        } else {
            this.movedX -= this.canvas.offsetLeft;
            this.movedY = pageY - this.canvas.offsetTop;
        }

        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        drawExternal();
        drawInternal();
        updateStickStatus();
    };

    const onTouchStart = event => {
        this.pressed = true;
        this.touchId = event.targetTouches[0].identifier;
        handleMovement(event, event.targetTouches[0].pageX, event.targetTouches[0].pageY);
    };

    const onTouchMove = event => {
        if (this.pressed && event.targetTouches[0].target === this.canvas) {
            handleMovement(event, event.targetTouches[0].pageX, event.targetTouches[0].pageY);
        }
    };

    const onTouchEnd = event => {
        if (event.changedTouches[0].identifier !== this.touchId) return;
        this.pressed = false;

        if (this.autoReturn) {
            this.movedX = this.centerX;
            this.movedY = this.centerY;
        }

        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        drawExternal();
        drawInternal();
        updateStickStatus();
    };

    const onMouseDown = event => {
        this.pressed = true;
        handleMovement(event, event.pageX, event.pageY);
    };

    const onMouseMove = event => {
        if (this.pressed) {
            handleMovement(event, event.pageX, event.pageY);
        }
    };

    const onMouseUp = event => {
        this.pressed = false;
        if (this.autoReturn) {
            this.movedX = this.centerX;
            this.movedY = this.centerY;
        }

        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        drawExternal();
        drawInternal();
        updateStickStatus();
    };

    if ("ontouchstart" in document.documentElement) {
        this.canvas.addEventListener("touchstart", onTouchStart, false);
        document.addEventListener("touchmove", onTouchMove, false);
        document.addEventListener("touchend", onTouchEnd, false);
    } else {
        this.canvas.addEventListener("mousedown", onMouseDown, false);
        document.addEventListener("mousemove", onMouseMove, false);
        document.addEventListener("mouseup", onMouseUp, false);
    }

    this.destroy = () => {
        this.canvas.remove();
        document.removeEventListener("touchmove", onTouchMove, false);
        document.removeEventListener("touchend", onTouchEnd, false);
        document.removeEventListener("mousemove", onMouseMove, false);
        document.removeEventListener("mouseup", onMouseUp, false);
    };

    this.externalTexture.onload = () => {
        this.internalTexture.onload = () => {
            drawExternal();
            drawInternal();
        };
    };

    this.GetWidth = () => this.canvas.width;
    this.GetHeight = () => this.canvas.height;
    this.GetX = () => (100 * ((this.movedX - this.centerX) / this.maxMoveStick)).toFixed();
    this.GetY = () => ((100 * ((this.movedY - this.centerY) / this.maxMoveStick)) * -1).toFixed();
};
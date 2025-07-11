import { asyncHandler }from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"

const generateAccessTokenAndRefreshToken = async(userId) => {
    try {
        const user = await User.findById(userId);

        if (!user) {
            console.log("No user found for ID:", userId);
            throw new ApiError(404, "User not found");
        }

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };

    } catch (error) {
        console.error("Token generation error:", error);
        throw new ApiError(500, error.message || "AccessToken and RefreshToken not generated");
    }
};


const registerUser = asyncHandler(async (req, res) => {
    const { username, fullname, email, password } = req.body;

    if ([username, fullname, email, password].some(field => typeof field !== "string" || field.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }

    const existingUser = await User.findOne({
        $or: [{ username }, { email }]
    });

    if (existingUser) {
        throw new ApiError(409, "User with given email or username already exists");
    }

    console.log("req.files", req.files);

    const avatarLocalPath = req.files?.avatar?.[0]?.path || null;
    // const coverImageLocalPath = req.files?.coverImage?.[0]?.path || null;

    let coverImageLocalPath;

    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files?.coverImage[0]?.path;
    }

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar image is required");    
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);


    const user = await User.create({
        username: username.toLowerCase(),
        fullname,
        email,
        password,
        avatar: avatar?.url || "",
        coverImage: coverImage?.url || ""
    });

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user");
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    );
});

const loginUser = asyncHandler(async (req, res) => {
    //req body = data
    // username or email 
    // find user
    // check password
    // generate access token and refresh token
    // send cookie

    const { email, username, password } = req.body;
    // console.log("req.body", req.body);

    if (!username && !email) {
        throw new ApiError(400, "Username or password is required");
    }
    
    const user = await User.findOne({
        $or: [{ email }, { username }]
    });

    if (!user) {
        throw new ApiError(400, "Username or email is incorrect");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(400, "Invalid User credentials");
    }

    const { accessToken, refreshToken } = await generateAccessTokenAndRefreshToken(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
    // console.log("Access Token:", accessToken);
    // console.log("Refresh Token:", refreshToken);
    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged in Successfully"
        )
    )

    
    
})
const logoutUser = asyncHandler(async(req,res)=>{
    // console.log("req.user", req.user);
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,{},"User logged Out"))
})

export {
    registerUser,
    loginUser,
    logoutUser
} 
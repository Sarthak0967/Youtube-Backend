import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"

const generateAccessTokenAndRefreshToken = async (userId) => {
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
        throw new ApiError(500, "AccessToken and RefreshToken not generated");
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

    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files?.coverImage[0]?.path;
    }

    if (!avatarLocalPath) {
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
        httpOnly: true
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
const logoutUser = asyncHandler(async (req, res) => {
    // console.log("req.user", req.user);
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
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
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged Out"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(400, "Refresh token is required");
    }



    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(404, "User not found");
        }

        if (user.refreshToken !== incomingRefreshToken) {
            throw new ApiError(403, "Invalid refresh token");
        }

        const { accessToken, newRefreshToken } = await generateAccessTokenAndRefreshToken(user._id);
        user.refreshToken = newRefreshToken;

        await user.save({ validateBeforeSave: false });

        const options = {
            httpOnly: true,
            secure: true
        }

        return res.status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(new ApiResponse(200, { accessToken, refreshToken: newRefreshToken }, "Tokens refreshed successfully"));


    } catch (error) {
        throw new ApiError(500, error?.message || "Failed to refresh access token");
    }


})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id);

    const isCurrentPasswordValid = await user.isPasswordCorrect(currentPassword);
    if (!isCurrentPasswordValid) {
        throw new ApiError(400, "Current password is incorrect");
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json(
        new ApiResponse(200, {}, "Password changed succesfully")
    )

})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(
        new ApiResponse(200, req.user, "Current user fetched successfully")
    )
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullname, email } = req.body;

    if (!fullname || !email) {
        throw new ApiError(400, "Fullname and email are required");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullname,
                email: email
            }
        },
        { new: true }
    ).select("-password -refreshToken");



    return res.status(200)
        .json(new ApiResponse(200, user, "User details updated successfully"));


});

const updateAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar image is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) {
        throw new ApiError(400, "Failed to upload avatar image");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        { new: true }
    ).select("-password -refreshToken");

    return res.status(200).json(
        new ApiResponse(200, user, "Avatar updated successfully")
    );

})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path;

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image is required");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage.url) {
        throw new ApiError(400, "Failed to upload cover image");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        { new: true }
    ).select("-password -refreshToken");

    return res.status(200).json(
        new ApiResponse(200, user, "Cover image updated successfully")
    );

})


const getUserChannelProfile = asyncHandler(async (req, res) => {

    const { username } = req.params;
    if (!username?.trim()) {
        throw new ApiError(400, "Username is required");
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: { $size: "$subscribers" },
                channelsSubscribedToCount: { $size: "$subscribedTo" },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullname: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ])

    if (!channel || channel.length === 0) {
        throw new ApiError(404, "Channel not found");
    }

    return res.status(200)
        .json(
            new ApiResponse(200, channel[0], "User channel profile fetched successfully")
        )



})


const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullname: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }

    ])

    if (!user || user.length === 0) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
        new ApiResponse(200, user[0].watchHistory, "Watch history fetched successfully")
    );


})



export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
} 
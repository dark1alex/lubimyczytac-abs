# lubimyczytac-abs
Audiobookshelf Custom Metadata Provider for LubimyCzytac

## Screenshots

### List of matches
![obraz](https://github.com/user-attachments/assets/f18d64fe-2849-4669-92b9-b2471f6a9a29)

### View of matched data
![obraz](https://github.com/user-attachments/assets/425ae529-3ab2-4e64-a998-0de8861b40ec)

## Fetching features:
- Cover
- Title
- Author
- Description (without html blocks)
- Publisher
- Publish Year
- Series
- Series number
- Genres
- Tags
- Language
- ISBN

## Not fetching:
- Lectors
- Rectangle covers for audiobooks

# Instructions

## How to run
1. Copy this repo:
```
git clone https://github.com/lakafior/lubimyczytac-abs.git
```
2. Move inside directory:
```
cd lubimyczytac-abs
```
3. Build Docker container using docker-compose:
```
docker-compose up -d
```

## How to use
1. Navigate to your AudiobookShelf settings
2. Navigate to Item Metadata Utils
3. Navigate to Custom Metadata Providers
4. Click on Add
5. Name: whatever for example LubimyCzytac
6. URL: http://your-ip:3000
7. Authorization Header Value: whatever, but not blank, for example 00000
8. Save

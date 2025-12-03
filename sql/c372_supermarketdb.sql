-- MySQL dump 10.13  Distrib 8.0.38, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: c372_supermarketdb
-- ------------------------------------------------------
-- Server version	8.0.40

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `cart`
--

DROP TABLE IF EXISTS `cart`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cart` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `cart_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart`
--

LOCK TABLES `cart` WRITE;
/*!40000 ALTER TABLE `cart` DISABLE KEYS */;
/*!40000 ALTER TABLE `cart` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cart_items`
--

DROP TABLE IF EXISTS `cart_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cart_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cart_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `cart_id` (`cart_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `cart_items_ibfk_1` FOREIGN KEY (`cart_id`) REFERENCES `cart` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cart_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_items`
--

LOCK TABLES `cart_items` WRITE;
/*!40000 ALTER TABLE `cart_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `cart_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cart_itemsss`
--

DROP TABLE IF EXISTS `cart_itemsss`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cart_itemsss` (
  `user_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`user_id`,`product_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `cart_itemsss_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `cart_itemsss_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_itemsss`
--

LOCK TABLES `cart_itemsss` WRITE;
/*!40000 ALTER TABLE `cart_itemsss` DISABLE KEYS */;
/*!40000 ALTER TABLE `cart_itemsss` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_items`
--

DROP TABLE IF EXISTS `order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_items` (
  `order_item_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` int NOT NULL,
  `price_per_unit` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_item_id`),
  KEY `order_items_ibfk_1` (`order_id`),
  KEY `order_items_ibfk_2` (`product_id`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_items`
--

LOCK TABLES `order_items` WRITE;
/*!40000 ALTER TABLE `order_items` DISABLE KEYS */;
INSERT INTO `order_items` VALUES (1,1,1,2,1.60,'2025-11-22 12:55:58'),(2,2,1,1,1.60,'2025-11-22 12:56:18'),(3,3,1,1,1.60,'2025-11-22 13:01:47'),(4,4,1,3,1.60,'2025-11-22 13:06:35'),(5,5,1,1,1.60,'2025-11-22 13:09:12'),(6,6,2,1,0.80,'2025-11-22 13:09:27'),(7,7,1,1,1.60,'2025-11-22 16:20:54'),(8,8,1,2,1.60,'2025-11-22 16:25:03'),(9,9,1,1,1.60,'2025-11-22 16:26:01'),(10,10,1,1,1.60,'2025-11-22 16:30:12'),(11,11,1,2,1.60,'2025-11-22 16:41:12'),(12,12,1,7,1.60,'2025-11-22 16:41:42'),(13,13,2,1,0.80,'2025-11-22 19:11:46'),(14,14,3,1,3.50,'2025-11-22 19:12:11'),(15,15,1,1,1.60,'2025-11-23 10:23:35'),(16,15,2,1,0.80,'2025-11-23 10:23:35'),(17,15,3,1,3.50,'2025-11-23 10:23:35'),(18,16,2,2,0.80,'2025-11-23 16:33:50'),(19,16,4,3,1.80,'2025-11-23 16:33:50'),(20,17,4,1,1.80,'2025-11-23 16:34:10'),(21,17,14,1,1.50,'2025-11-23 16:34:10'),(22,18,3,1,3.50,'2025-11-23 16:37:21'),(23,18,19,1,10.00,'2025-11-23 16:37:21'),(24,19,2,1,0.80,'2025-11-23 16:39:43'),(25,20,2,1,0.80,'2025-11-23 16:39:58'),(26,21,19,1,10.00,'2025-11-23 16:40:06'),(27,22,14,1,1.50,'2025-11-24 03:49:08'),(28,23,1,1,1.60,'2025-11-24 04:28:51'),(29,24,3,1,3.50,'2025-11-28 13:19:02'),(30,25,2,2,0.80,'2025-12-01 07:51:56'),(31,26,4,36,1.80,'2025-12-01 12:48:48'),(32,27,14,3,1.50,'2025-12-01 12:53:10'),(33,28,2,1,0.80,'2025-12-01 12:53:59'),(34,29,3,1,3.50,'2025-12-01 12:54:14'),(35,30,19,1,10.00,'2025-12-01 13:00:38'),(36,31,3,1,3.50,'2025-12-01 13:03:15'),(37,32,2,1,0.80,'2025-12-01 16:42:56'),(38,33,3,3,3.50,'2025-12-02 07:41:59'),(39,34,3,1,3.50,'2025-12-02 08:37:36');
/*!40000 ALTER TABLE `order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `order_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `order_date` datetime DEFAULT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `status` enum('Pending','Paid','Shipped') DEFAULT 'Pending',
  `payment_method` varchar(45) DEFAULT NULL,
  `invoice_number` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`order_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (1,35,'2025-11-22 20:55:58',3.20,'Pending',NULL,NULL),(2,35,'2025-11-22 20:56:18',1.60,'Pending',NULL,NULL),(3,35,'2025-11-22 21:01:47',1.60,'Pending',NULL,NULL),(4,35,'2025-11-22 21:06:35',4.80,'Pending',NULL,'INV-xXv9Kn'),(5,35,'2025-11-22 21:09:12',1.60,'Pending',NULL,'INV-rvXrs0'),(6,35,'2025-11-22 21:09:27',0.80,'Pending',NULL,'INV-hcdMVq'),(7,35,'2025-11-23 00:20:54',1.60,'Pending',NULL,'INV-azgQrY'),(8,35,'2025-11-23 00:25:03',3.20,'Pending',NULL,'INV-pL2Gm1'),(9,35,'2025-11-23 00:26:01',1.60,'Pending',NULL,'INV-91PqEb'),(10,35,'2025-11-23 00:30:12',1.60,'Pending',NULL,'INV-vm0apU'),(11,35,'2025-11-23 00:41:12',3.20,'Pending',NULL,'INV-biAV2f'),(12,35,'2025-11-23 00:41:42',11.20,'Pending',NULL,'INV-3MSJX9'),(13,35,'2025-11-23 03:11:46',0.80,'Pending',NULL,'INV-dv5rUC'),(14,35,'2025-11-23 03:12:11',3.50,'Pending',NULL,'INV-LVPp75'),(15,35,'2025-11-23 18:23:35',5.90,'Pending',NULL,'INV-rykLL9'),(16,35,'2025-11-24 00:33:50',7.00,'Pending',NULL,'INV-yFUL3c'),(17,35,'2025-11-24 00:34:10',3.30,'Pending',NULL,'INV-49KkxJ'),(18,35,'2025-11-24 00:37:21',13.50,'Pending',NULL,'INV-oIGu7w'),(19,35,'2025-11-24 00:39:43',0.80,'Pending',NULL,'INV-jjHUtc'),(20,35,'2025-11-24 00:39:58',0.80,'Pending',NULL,'INV-5glJGK'),(21,35,'2025-11-24 00:40:06',10.00,'Pending',NULL,'INV-rnTOUC'),(22,35,'2025-11-24 11:49:08',1.50,'Pending',NULL,'INV-I4VXRX'),(23,39,'2025-11-24 12:28:51',1.60,'Pending',NULL,'INV-RKiqFx'),(24,39,'2025-11-28 21:19:02',3.50,'Pending',NULL,'INV-vRQEZs'),(25,39,'2025-12-01 15:51:56',1.60,'Pending',NULL,'INV-UZXL8b'),(26,39,'2025-12-01 20:48:48',64.80,'Pending',NULL,'INV-qZTJZK'),(27,39,'2025-12-01 20:53:10',4.50,'Pending',NULL,'INV-voLdDt'),(28,39,'2025-12-01 20:53:59',0.80,'Pending',NULL,'INV-20251201205359-CxS6'),(29,39,'2025-12-01 20:54:14',3.50,'Pending',NULL,'INV-20251201205414-0vwZ'),(30,39,'2025-12-01 21:00:38',10.00,'Pending',NULL,'INV-20251201130038-gWYb'),(31,39,'2025-12-01 21:03:15',3.50,'Pending',NULL,'INV-20251201130315-TcWB'),(32,39,'2025-12-02 00:42:56',0.80,'Pending',NULL,'INV-20251201164256-3xP8'),(33,43,'2025-12-02 15:41:59',10.50,'Pending',NULL,'INV-20251202074159-R3ZZ'),(34,39,'2025-12-02 16:37:36',3.50,'Pending',NULL,'INV-20251202083736-HX8x');
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `productName` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `quantity` int NOT NULL,
  `price` double(10,2) NOT NULL,
  `image` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (1,'Apples',1,1.60,'apples.png'),(2,'Bananas',2,0.80,'bananas.png'),(3,'Milk',40,3.50,'milk.png'),(4,'Bread',40,1.80,'bread.png'),(14,'Tomatoes',75,1.50,'tomatoes.png'),(19,'Broccoli',97,10.00,'Broccoli.png');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reviews`
--

DROP TABLE IF EXISTS `reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reviews` (
  `review_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `rating` int DEFAULT NULL,
  `comment` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`review_id`),
  KEY `fk_review_user` (`user_id`),
  CONSTRAINT `fk_review_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reviews_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reviews`
--

LOCK TABLES `reviews` WRITE;
/*!40000 ALTER TABLE `reviews` DISABLE KEYS */;
INSERT INTO `reviews` VALUES (1,35,5,'Testing','2025-11-22 17:23:25'),(2,35,5,'WOW','2025-11-22 17:23:36'),(3,35,5,'2','2025-11-22 17:23:45'),(4,35,5,'4','2025-11-22 17:23:48'),(5,35,4,'testing v2','2025-11-22 21:28:40'),(6,35,5,'test','2025-11-23 06:25:17'),(7,39,5,'testing','2025-11-24 04:33:36'),(8,39,5,'testing 123','2025-12-02 07:50:22'),(9,39,3,'testing 345\r\n','2025-12-02 08:46:27');
/*!40000 ALTER TABLE `reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(20) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `address` varchar(255) NOT NULL,
  `contact` varchar(10) NOT NULL,
  `role` varchar(10) DEFAULT 'user',
  `verified` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=44 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (32,'kang','willkang0820@gmail.com','7c4a8d09ca3762af61e59520943dc26494f8941b','bedok','98765432','admin',1),(35,'wj','WEIJIE0214@GMAIL.COM','7c4a8d09ca3762af61e59520943dc26494f8941b','bedok','98765432','admin',1),(39,'cw','ibankingabc@gmail.com','7c4a8d09ca3762af61e59520943dc26494f8941b','bedok','98765432','member',1),(43,'kj','kjss46158@gmail.com','7c4a8d09ca3762af61e59520943dc26494f8941b','bedok','98765432','user',1);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'c372_supermarketdb'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-03 22:50:46

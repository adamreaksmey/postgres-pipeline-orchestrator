import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { PipelinesService } from './pipelines.service';
import { CreatePipelineDto } from '../../dto/create-pipeline.dto';
import { UpdatePipelineDto } from '../../dto/update-pipeline.dto';

@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  @Get()
  async findAll() {
    return this.pipelinesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const pipeline = await this.pipelinesService.findOne(id);
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    return pipeline;
  }

  @Post()
  async create(@Body() dto: CreatePipelineDto) {
    return this.pipelinesService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePipelineDto) {
    const pipeline = await this.pipelinesService.findOne(id);
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    return this.pipelinesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    try {
      await this.pipelinesService.remove(id);
    } catch {
      throw new NotFoundException('Pipeline not found');
    }
  }
}

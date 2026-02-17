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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PipelinesService } from './pipelines.service';
import { CreatePipelineDto } from '../../dto/create-pipeline.dto';
import { UpdatePipelineDto } from '../../dto/update-pipeline.dto';

@ApiTags('pipelines')
@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  @Get()
  @ApiOperation({ summary: 'List pipelines' })
  async findAll() {
    return this.pipelinesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one pipeline' })
  async findOne(@Param('id') id: string) {
    const pipeline = await this.pipelinesService.findOne(id);
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    return pipeline;
  }

  @Post()
  @ApiOperation({ summary: 'Create a pipeline' })
  async create(@Body() dto: CreatePipelineDto) {
    return this.pipelinesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a pipeline' })
  async update(@Param('id') id: string, @Body() dto: UpdatePipelineDto) {
    const pipeline = await this.pipelinesService.findOne(id);
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    return this.pipelinesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a pipeline' })
  async remove(@Param('id') id: string) {
    try {
      await this.pipelinesService.remove(id);
    } catch {
      throw new NotFoundException('Pipeline not found');
    }
  }
}
